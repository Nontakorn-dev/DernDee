"""
DernDee v2.0 - Main Gateway (Dual-Foot System)
===============================================
Architecture: CWT Detector → ZUPT Estimator

Simplified from v1.0:
- 2 sensors only (Left/Right Foot)
- CWT-based walking detection (noise rejection)
- ZUPT + Linear Dedrifting for accurate stride measurement
"""

import asyncio
import json
import time
from pathlib import Path
import websockets
import numpy as np
from connection import MultiBLEManager
from decoder import decode_packet
from scaling import scale_data
from shoe_detector import CWTWalkingDetector  # [v2.0] CWT-based
from gait_estimator import ZUPTGaitEstimator, DualFootAnalyzer  # [v2.0] ZUPT-based
from calibration import CalibrationManager
from feedback_engine import FeedbackEngine
from sample_export import LiveSampleExporter
from shank_event_detector_prototype import ShankEventDetectorComparison

# ==== Global State ====
# Per-device instances
detectors = {}  # {Name: CWTWalkingDetector}
estimators = {}  # {Name: ZUPTGaitEstimator}
prototype_comparators = {}  # {Name: ShankEventDetectorComparison}

# Shared analyzers
dual_foot_analyzer = DualFootAnalyzer()
calibration_manager = CalibrationManager()
feedback_engine = FeedbackEngine()
sample_exporter = LiveSampleExporter(Path(__file__).resolve().parent / "recordings")

# Tracking
last_timestamps = {}  # {sender_name: timestamp_ms}
last_seen_times = {}  # {sender_name: timestamp_ms}
last_walking_flags = {}  # {sender_name: bool}

# WebSocket clients
connected_clients = set()


def infer_sensor_mount(sender_name):
    """Infer whether the IMU is mounted on the foot or shank from the device name."""
    return "shank" if "Shank" in sender_name else "foot"


def convert_to_json_serializable(obj):
    """Convert numpy types to Python native types."""
    if isinstance(obj, (np.integer, np.floating)):
        return float(obj) if isinstance(obj, np.floating) else int(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, dict):
        return {k: convert_to_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [convert_to_json_serializable(item) for item in obj]
    elif obj is None:
        return None
    else:
        return obj


def serialize_prototype_compare(result):
    """Convert detector dataclass results into plain dicts for WebSocket payloads."""
    if not result:
        return None
    return {
        "timestamp_ms": result.get("timestamp_ms"),
        "norm": {
            "phase": result["norm"].phase,
            "event": result["norm"].event,
            "debug": result["norm"].debug,
        },
        "fsm": {
            "phase": result["fsm"].phase,
            "event": result["fsm"].event,
            "debug": result["fsm"].debug,
        },
    }


def reset_runtime_state():
    """Reset runtime-only state while preserving calibration results."""
    for det in detectors.values():
        det.reset()
    for est in estimators.values():
        est.reset()

    prototype_comparators.clear()
    dual_foot_analyzer.reset()
    feedback_engine.reset()
    last_timestamps.clear()
    last_seen_times.clear()
    last_walking_flags.clear()


async def broadcast(data):
    """Broadcast data to all connected WebSocket clients."""
    if not connected_clients:
        return
    data_serializable = convert_to_json_serializable(data)
    message = json.dumps(data_serializable)
    for ws in list(connected_clients):
        try:
            await ws.send(message)
        except:
            pass


async def ws_handler(websocket):
    """WebSocket handler for client connections."""
    connected_clients.add(websocket)
    print(f"📱 WebSocket client connected (Total: {len(connected_clients)})")
    await websocket.send(json.dumps({"type": "RECORDING_STATUS", "payload": sample_exporter.get_status()}))
    
    try:
        async for message in websocket:
            if message == "CALIBRATE":
                reset_runtime_state()
                calibration_manager.start_calibration()
                await broadcast({"type": "CALIBRATION_START"})
                
            elif message == "RESET":
                reset_runtime_state()
                print("🔄 All systems reset")
                await broadcast({"type": "SYSTEM_RESET"})

            elif message == "START_RECORD":
                status = sample_exporter.start()
                print(f"🎙️ Sample export started: {status.get('session_dir')}")
                await broadcast({"type": "RECORDING_STATUS", "payload": status})

            elif message == "STOP_RECORD":
                status = sample_exporter.stop()
                print(f"🧾 Sample export stopped: {status.get('session_dir')}")
                await broadcast({"type": "RECORDING_STATUS", "payload": status})
                
    except websockets.exceptions.ConnectionClosed:
        print("📱 WebSocket client disconnected")
    except Exception as e:
        print(f"⚠️ WebSocket error: {e}")
    finally:
        connected_clients.discard(websocket)
        print(f"📱 WebSocket client removed (Total: {len(connected_clients)})")


def apply_foot_axis_config(ax, ay, az, gx, gy, gz, is_right=False):
    """
    Axis configuration for Custom Installation (Y-Forward, Z-Up).
    
    Installation:
    - Chip Y: Points to Big Toe (Forward)
    - Chip Z: Points to Sky (Up)
    - Chip X: Points Right (by right-hand rule)
    
    Target Frame (NWU / Body Frame):
    - World X: Forward
    - World Y: Left
    - World Z: Up
    """
    
    # Mapping based on Y=Forward, Z=Up:
    # New X (Fwd)  = Chip Y
    # New Y (Left) = -Chip X  (Because Chip X points Right)
    # New Z (Up)   = Chip Z
    
    n_ax = ay
    n_ay = -ax
    n_az = az
    
    n_gx = gy
    n_gy = -gx
    n_gz = gz
    
    # Note: We do NOT use 'if is_right' mirroring here because 
    # we want a consistent Right-Handed Frame (Forward-Left-Up) for both feet
    # to ensure Madgwick Filter works correctly.
    # (Left Foot Lateral = +Y, Right Foot Lateral = -Y)
    
    return n_ax, n_ay, n_az, n_gx, n_gy, n_gz


def data_handler(sender_name, data):
    """
    Main data callback for all BLE devices.
    Implements the 2-layer architecture:
    Layer 1: CWT Detector (noise filtering)
    Layer 2: ZUPT Estimator (gait parameters)
    """
    # 1. Decode packet
    raw = decode_packet(data)
    if not raw:
        return
    
    # 2. Scale to physical units
    physics = scale_data(raw)
    current_ts = physics["timestamp"]
    last_seen_times[sender_name] = current_ts
    
    # Calculate dt
    dt_sec = 0.01
    if sender_name in last_timestamps:
        diff_ms = current_ts - last_timestamps[sender_name]
        if 0 < diff_ms < 500:
            dt_sec = diff_ms / 1000.0
    last_timestamps[sender_name] = current_ts
    
    # 3. Initialize detectors/estimators if needed
    sensor_mount = infer_sensor_mount(sender_name)
    side = "L" if ("_L_" in sender_name or "Left" in sender_name or "L_Shank" in sender_name) else "R"
    if sender_name not in detectors:
        detectors[sender_name] = CWTWalkingDetector(sample_rate=100.0)
        estimators[sender_name] = ZUPTGaitEstimator(sample_rate=100.0, sensor_mount=sensor_mount)
        print(f"🆕 Created CWT Detector + ZUPT Estimator for {sender_name}")
    if sensor_mount == "shank" and sender_name not in prototype_comparators:
        prototype_comparators[sender_name] = ShankEventDetectorComparison(side=side)
        print(f"🧪 Created Shank Prototype Comparator for {sender_name}")
    
    # 4. Apply axis remapping
    ax_raw, ay_raw, az_raw = physics["accel"]
    gx_raw, gy_raw, gz_raw = physics["gyro"]
    
    # Support both old names (L_Shank/R_Shank) and new names (L_Foot/R_Foot)
    is_right = "_R_" in sender_name or "Right" in sender_name or "R_Shank" in sender_name
    ax, ay, az, gx, gy, gz = apply_foot_axis_config(
        ax_raw, ay_raw, az_raw, gx_raw, gy_raw, gz_raw, is_right=is_right
    )
    
    accel = np.array([ax, ay, az])
    gyro = np.array([gx, gy, gz])
    
    # === CALIBRATION MODE ===
    if calibration_manager.is_calibrating():
        # Use remapped but otherwise uncorrected data so re-calibration can learn fresh biases/scales.
        calibration_manager.process_data(sender_name, [1, 0, 0, 0], gyro.tolist(), accel.tolist())
        
        if not calibration_manager.is_calibrating():
            if calibration_manager.status == "SUCCESS":
                print(f"✅ {sender_name}: Calibration completed!")
                
                # === INSTANT ALIGNMENT (per SRS) ===
                for device_name, mean_accel in calibration_manager.avg_accels.items():
                    if mean_accel is None:
                        continue
                    if device_name not in estimators:
                        device_mount = infer_sensor_mount(device_name)
                        estimators[device_name] = ZUPTGaitEstimator(sample_rate=100.0, sensor_mount=device_mount)
                        print(f"🆕 Created ZUPT Estimator for {device_name} during calibration")

                    ax_mean, ay_mean, az_mean = mean_accel[0], mean_accel[1], mean_accel[2]

                    # Remap: Y-Forward, Z-Up installation
                    n_ax = ay_mean
                    n_ay = -ax_mean
                    n_az = az_mean

                    # Initialize estimator orientation from gravity
                    estimators[device_name].initialize_orientation(n_ax, n_ay, n_az)
                    print(f"⚡ {device_name}: Instant Alignment applied!")
                
                asyncio.create_task(broadcast({"type": "CALIBRATION_DONE"}))
            else:
                print(f"❌ {sender_name}: Calibration failed")
                asyncio.create_task(broadcast({"type": "CALIBRATION_FAILED"}))
        return

    # 5. Apply calibration if available
    corrected_gyro = calibration_manager.get_corrected_gyro(sender_name, gyro)
    gyro = np.asarray(corrected_gyro, dtype=float)
    
    accel_scale = calibration_manager.get_accel_scale(sender_name)
    accel = accel * accel_scale

    sample_exporter.record_sample(
        sensor_name=sender_name,
        side=side,
        sensor_mount=sensor_mount,
        timestamp_ms=current_ts,
        accel=accel,
        gyro=gyro,
        raw_accel=physics["accel"],
        raw_gyro=physics["gyro"],
        dt_sec=dt_sec,
    )

    prototype_compare = None
    if sensor_mount == "shank":
        comparator = prototype_comparators[sender_name]
        prototype_compare = comparator.update(accel.tolist(), gyro.tolist(), current_ts)
    
    # === LAYER 1: CWT WALKING DETECTOR ===
    detector = detectors[sender_name]
    detection = detector.update(gyro[0], gyro[1], gyro[2], current_ts)
    
    is_walking = detection['is_walking']
    step_detected = detection['step_detected']
    
    # === DEBUG: Show values every 100 samples ===
    if int(current_ts) % 1000 < 15:  # ~every second
        print(f"🔍 [{sender_name}] gyro_norm={detection['gyro_norm']:.2f} rad/s | CWT={detection['cwt_value']:.2f} | thresh={detection['adaptive_threshold']:.2f} | walking={is_walking}")
    
    # === LAYER 2: ZUPT ESTIMATOR ===
    # Always integrate position so real-time game displays (Clearance, etc.)
    # respond instantly. Stance/swing detection handles ZUPT resets naturally.
    # Only gate STEP METRIC reporting on CWT is_walking.
    estimator = estimators[sender_name]
    prev_is_walking = last_walking_flags.get(sender_name, False)

    if is_walking and not prev_is_walking:
        print(f"🚶 [{sender_name}] Walking bout detected")
    elif (not is_walking) and prev_is_walking:
        print(f"🛑 [{sender_name}] Walking bout ended")
    
    # Always integrate; stance/swing detector handles ZUPT naturally.
    # CWT is kept for bout logging only, not for gating position or step metrics.
    gait_result = estimator.update(accel.tolist(), gyro.tolist(), current_ts, dt=dt_sec, is_walking=True)
    last_walking_flags[sender_name] = is_walking
    
    # === DUAL FOOT ANALYSIS ===
    feedback_result = None
    session_metrics = dual_foot_analyzer.get_session_metrics()
    
    if gait_result:
        gait_result["sensor_mount"] = sensor_mount
        if sensor_mount != "foot":
            # This metric is defined for foot-mounted IMUs; on shank it becomes misleading.
            gait_result["touchdown_pitch_deg"] = None

        # Add to dual-foot analyzer and compute aggregate session metrics
        session_metrics = dual_foot_analyzer.register_step(side, gait_result)
        
        # Enrich per-step metrics with dual-foot aggregates
        gait_result['symmetry_percent'] = session_metrics['symmetry_percent']
        gait_result['step_count'] = session_metrics['total_steps']
        gait_result['total_steps'] = session_metrics['total_steps']
        gait_result['cadence_spm'] = session_metrics.get('cadence_spm')

        # `step_duration_s` is defined as the alternating-foot step interval.
        if session_metrics.get('latest_step_duration_s') is not None:
            gait_result['step_duration_s'] = session_metrics['latest_step_duration_s']
        elif session_metrics.get('avg_step_duration_s') is not None:
            gait_result['step_duration_s'] = session_metrics['avg_step_duration_s']
        
        # === Virtual Gait Coach: Analyze step with hierarchical feedback ===
        feedback_result = feedback_engine.analyze_step(gait_result, side=side)
        if feedback_result:
            print(f"🗣️ [{side}] {feedback_result.get('text', '')}")

    state = estimator.get_current_state()
    
    # === BROADCAST TO FRONTEND ===
    if connected_clients:
        payload = {
            "type": "DATA",
            "payload": {
                "name": sender_name,
                "side": side,
                "sensor_mount": sensor_mount,
                # Detection layer
                "is_walking": is_walking,
                "step_detected": step_detected,
                "gyro_norm": detection['gyro_norm'],
                "cwt_value": detection['cwt_value'],
                "adaptive_threshold": detection['adaptive_threshold'],
                "steps_in_bout": detection['steps_in_bout'],
                "prototype_compare": serialize_prototype_compare(prototype_compare),
                # Estimator layer
                "is_stance": state['is_stance'],
                "position": state['position'],
                "velocity": state['velocity'],
                "quaternion": state['quaternion'],
                "accel": accel.tolist(),  # Body-frame accel for drift-free tilt (Balance game)
                "sensor_total_steps": state['total_steps'],
                "last_reject_reason": state.get('last_reject_reason'),
                "total_steps": session_metrics.get('total_steps', 0),
                # Gait metrics (if step completed)
                "gait_metrics": gait_result,
                "session_metrics": session_metrics,
                # Feedback
                "feedback": feedback_result
            }
        }
        
        asyncio.create_task(broadcast(payload))
    
    # === DEBUG OUTPUT (Throttled) ===
    if current_ts % 500 < 10:
        status = "🏃" if is_walking else "🛑"
        stance = "STANCE" if estimator.is_stance else "SWING"
        print(f"[{sender_name}] {status} Walking | {stance} | Steps: {state['total_steps']}")


async def main():
    """Main entry point."""
    print("=" * 50)
    print("  DernDee v2.0 - Dual-Foot Gait Analysis System")
    print("=" * 50)
    print("Architecture: CWT Detector → ZUPT Estimator")
    print("Sensors: Left Foot + Right Foot (2 IMUs)")
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
