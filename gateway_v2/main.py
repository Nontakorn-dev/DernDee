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
import websockets
import numpy as np
from connection import MultiBLEManager
from decoder import decode_packet
from scaling import scale_data
from shoe_detector import CWTWalkingDetector  # [v2.0] CWT-based
from gait_estimator import ZUPTGaitEstimator, DualFootAnalyzer  # [v2.0] ZUPT-based
from calibration import CalibrationManager
from feedback_engine import FeedbackEngine

# ==== Global State ====
# Per-device instances
detectors = {}  # {Name: CWTWalkingDetector}
estimators = {}  # {Name: ZUPTGaitEstimator}

# Shared analyzers
dual_foot_analyzer = DualFootAnalyzer()
calibration_manager = CalibrationManager()
feedback_engine = FeedbackEngine()

# Tracking
last_timestamps = {}  # {sender_name: timestamp_ms}
last_seen_times = {}  # {sender_name: timestamp_ms}

# WebSocket clients
connected_clients = set()


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
    
    try:
        async for message in websocket:
            if message == "CALIBRATE":
                calibration_manager.start_calibration()
                await broadcast({"type": "CALIBRATION_START"})
                
            elif message == "RESET":
                # Reset all detectors and estimators
                for det in detectors.values():
                    det.reset()
                for est in estimators.values():
                    est.reset()
                dual_foot_analyzer.reset()
                print("🔄 All systems reset")
                await broadcast({"type": "SYSTEM_RESET"})
                
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
    if sender_name not in detectors:
        detectors[sender_name] = CWTWalkingDetector(sample_rate=100.0)
        estimators[sender_name] = ZUPTGaitEstimator(sample_rate=100.0)
        print(f"🆕 Created CWT Detector + ZUPT Estimator for {sender_name}")
    
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
    
    # 5. Apply calibration if available
    corrected_gyro = calibration_manager.get_corrected_gyro(sender_name, gyro.tolist())
    gyro = np.array(corrected_gyro)
    
    accel_scale = calibration_manager.get_accel_scale(sender_name)
    accel = accel * accel_scale
    
    # === CALIBRATION MODE ===
    if calibration_manager.is_calibrating():
        calibration_manager.process_data(sender_name, [1, 0, 0, 0], gyro.tolist(), accel.tolist())
        
        if not calibration_manager.is_calibrating():
            if calibration_manager.status == "SUCCESS":
                print(f"✅ {sender_name}: Calibration completed!")
                
                # === INSTANT ALIGNMENT (per SRS) ===
                # Get average accel during calibration (gravity vector)
                mean_accel = calibration_manager.get_average_accel(sender_name)
                
                if mean_accel is not None and sender_name in estimators:
                    # Apply axis remapping to mean accel (same as live data)
                    is_right = "_R_" in sender_name or "Right" in sender_name or "R_Shank" in sender_name
                    ax, ay, az = mean_accel[0], mean_accel[1], mean_accel[2]
                    
                    # Remap: Y-Forward, Z-Up installation
                    n_ax = ay
                    n_ay = -ax
                    n_az = az
                    
                    # Initialize estimator orientation from gravity
                    estimators[sender_name].initialize_orientation(n_ax, n_ay, n_az)
                    print(f"⚡ {sender_name}: Instant Alignment applied!")
                
                asyncio.create_task(broadcast({"type": "CALIBRATION_DONE"}))
            else:
                print(f"❌ {sender_name}: Calibration failed")
                asyncio.create_task(broadcast({"type": "CALIBRATION_FAILED"}))
        return
    
    # === LAYER 1: CWT WALKING DETECTOR ===
    detector = detectors[sender_name]
    detection = detector.update(gyro[0], gyro[1], gyro[2], current_ts)
    
    is_walking = detection['is_walking']
    step_detected = detection['step_detected']
    
    # === DEBUG: Show values every 100 samples ===
    if int(current_ts) % 1000 < 15:  # ~every second
        print(f"🔍 [{sender_name}] gyro_norm={detection['gyro_norm']:.2f} rad/s | CWT={detection['cwt_value']:.2f} | thresh={detection['adaptive_threshold']:.2f} | walking={is_walking}")
    
    # === LAYER 2: ZUPT ESTIMATOR (Only if walking) ===
    estimator = estimators[sender_name]
    gait_result = None
    
    if is_walking:
        # Pass real dt from ESP32 timestamp for accurate integration
        gait_result = estimator.update(accel.tolist(), gyro.tolist(), current_ts, dt=dt_sec, is_walking=True)
    else:
        # Still update for stance detection, but don't integrate
        estimator.update(accel.tolist(), gyro.tolist(), current_ts, dt=dt_sec, is_walking=False)
    
    # === DUAL FOOT ANALYSIS ===
    feedback_result = None
    session_metrics = dual_foot_analyzer.get_session_metrics()
    # Determine side - support both naming conventions
    side = "L" if ("_L_" in sender_name or "Left" in sender_name or "L_Shank" in sender_name) else "R"
    
    if gait_result:
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
    
    # === BROADCAST TO FRONTEND ===
    if connected_clients:
        state = estimator.get_current_state()
        
        payload = {
            "type": "DATA",
            "payload": {
                "name": sender_name,
                "side": side,
                # Detection layer
                "is_walking": is_walking,
                "step_detected": step_detected,
                "gyro_norm": detection['gyro_norm'],
                "cwt_value": detection['cwt_value'],
                "adaptive_threshold": detection['adaptive_threshold'],
                "steps_in_bout": detection['steps_in_bout'],
                # Estimator layer
                "is_stance": state['is_stance'],
                "position": state['position'],
                "velocity": state['velocity'],
                "quaternion": state['quaternion'],
                "sensor_total_steps": state['total_steps'],
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
