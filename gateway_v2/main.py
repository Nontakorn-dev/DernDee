"""
DernDee v3.0 - Raw IMU Streaming Gateway
=========================================
Architecture: BLE decoder -> WebSocket raw stream -> frontend analysis
"""

import asyncio
import json

import websockets

from connection import MultiBLEManager
from decoder import decode_packet
from session_persistence import SessionPersistenceManager, SupabaseSessionRepository

connected_clients = set()
session_persistence = SessionPersistenceManager(SupabaseSessionRepository())
calibration_task: asyncio.Task | None = None


def infer_sensor_mount(sender_name):
    return "shank" if "Shank" in sender_name else "foot"


def infer_side(sender_name):
    if "_L_" in sender_name or "Left" in sender_name or "L_Shank" in sender_name:
        return "L"
    return "R"


def reset_runtime_state():
    session_persistence.reset()


def cancel_calibration_task():
    global calibration_task
    if calibration_task and not calibration_task.done():
        calibration_task.cancel()
    calibration_task = None


async def finish_calibration_after_delay():
    global calibration_task
    try:
        await asyncio.sleep(3)
        await broadcast({"type": "CALIBRATION_DONE"})
    except asyncio.CancelledError:
        return
    finally:
        calibration_task = None


async def handle_control_message(message_type, payload):
    global calibration_task

    if message_type == "CALIBRATE":
        cancel_calibration_task()
        await broadcast({"type": "CALIBRATION_START"})
        calibration_task = asyncio.create_task(finish_calibration_after_delay())
        return

    if message_type == "RESET":
        cancel_calibration_task()
        reset_runtime_state()
        print("🔄 Raw gateway state reset")
        await broadcast({"type": "SYSTEM_RESET"})
        return

    if message_type == "START_SESSION":
        patient_id = payload.get('patient_id')
        session_type = payload.get('session_type', 'free_walk')

        if not patient_id:
            await broadcast({
                "type": "SESSION_START_FAILED",
                "payload": {"reason": "patient_id is required"},
            })
            return

        reset_runtime_state()
        active_session = session_persistence.start_session(
            patient_id=patient_id,
            session_type=session_type,
            metadata=payload,
        )
        print(f"📝 Session started for patient {patient_id} ({session_type})")
        await broadcast({
            "type": "SESSION_STARTED",
            "payload": {
                "gateway_session_id": active_session.gateway_session_id,
                "patient_id": patient_id,
                "session_type": session_type,
            },
        })
        return

    if message_type == "END_SESSION":
        try:
            summary = payload.get('summary') or {}
            result = session_persistence.end_session(
                session_metrics=summary,
                summary_overrides=summary,
                session_details=payload.get('details') or {},
                gait_metrics_rows=payload.get('gait_metrics_rows') or [],
                source=payload.get('source') or 'frontend',
            )
        except Exception as error:
            print(f"❌ Failed to persist session: {error}")
            await broadcast({
                "type": "SESSION_SAVE_FAILED",
                "payload": {"reason": str(error)},
            })
            reset_runtime_state()
            return

        if result:
            print(f"✅ Session persisted ({result['saved_metrics_count']} gait metrics)")
            await broadcast({
                "type": "SESSION_SAVED",
                "payload": result,
            })
        else:
            await broadcast({
                "type": "SESSION_SAVE_SKIPPED",
                "payload": {"reason": "no active session"},
            })

        reset_runtime_state()


async def broadcast(data):
    if not connected_clients:
        return

    message = json.dumps(data)
    stale_clients = []
    for websocket in list(connected_clients):
        try:
            await websocket.send(message)
        except Exception:
            stale_clients.append(websocket)

    for websocket in stale_clients:
        connected_clients.discard(websocket)


async def ws_handler(websocket):
    connected_clients.add(websocket)
    print(f"📱 WebSocket client connected (Total: {len(connected_clients)})")

    try:
        async for message in websocket:
            try:
                parsed_message = json.loads(message)
                message_type = parsed_message.get('type')
                payload = parsed_message.get('payload') or {}
            except json.JSONDecodeError:
                message_type = message
                payload = {}

            await handle_control_message(message_type, payload)

    except websockets.exceptions.ConnectionClosed:
        print("📱 WebSocket client disconnected")
    except Exception as error:
        print(f"⚠️ WebSocket error: {error}")
    finally:
        connected_clients.discard(websocket)
        print(f"📱 WebSocket client removed (Total: {len(connected_clients)})")


def data_handler(sender_name, data):
    raw = decode_packet(data)
    if not raw:
        return

    payload = {
        "type": "DATA",
        "payload": {
            "name": sender_name,
            "side": infer_side(sender_name),
            "sensor_mount": infer_sensor_mount(sender_name),
            "timestamp_ms": raw.get("timestamp"),
            "raw_accel": raw["raw_accel"],
            "raw_gyro": raw["raw_gyro"],
        },
    }
    asyncio.create_task(broadcast(payload))


async def main():
    """Main entry point."""
    print("=" * 50)
    print("  DernDee v3.0 - Raw IMU Streaming Gateway")
    print("=" * 50)
    print("Architecture: Decoder -> WebSocket raw stream")
    print("Sensors: DernDee BLE IMUs")
    print("")
    
    # BLE Manager
    manager = MultiBLEManager(target_prefix="DernDee")
    
    # WebSocket Server
    print("🌍 Starting WebSocket Server on port 8765...")
    try:
        server = await websockets.serve(ws_handler, "0.0.0.0", 8765)
        print("✅ WebSocket Server is running at ws://0.0.0.0:8765")
    except OSError as e:
        if "Address already in use" in str(e) or e.errno == 48:
            print("❌ Port 8765 is already in use!")
            print("   Run: lsof -ti:8765 | xargs kill")
            return
        else:
            raise
    
    async with server:
        # BLE Task
        async def ble_task():
            try:
                await manager.scan_and_connect(data_handler)
                await manager.keep_alive()
            except Exception as e:
                print(f"⚠️ BLE Error: {e}")
                while True:
                    await asyncio.sleep(10)
                    try:
                        await manager.scan_and_connect(data_handler)
                    except:
                        pass
        
        ble_handle = asyncio.create_task(ble_task())
        
        try:
            await ble_handle
        except asyncio.CancelledError:
            pass
        except KeyboardInterrupt:
            print("\n🛑 Shutting down...")
            ble_handle.cancel()
            await manager.disconnect_all()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"❌ Fatal Error: {e}")
        import traceback
        traceback.print_exc()
