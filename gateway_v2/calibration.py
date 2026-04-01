import time
import numpy as np
from scipy.spatial.transform import Rotation as R

class CalibrationManager:
    def __init__(self):
        self.state = "IDLE" # IDLE, COLLECTING, CALIBRATED
        self.start_time = 0
        self.duration = 3.0
        
        # Buffers for 3s data
        self.buffer_quat = {} # {sender_name: [quaternions]}
        self.buffer_gyro = {} # {sender_name: [gyro_x, gyro_y, gyro_z]}
        self.buffer_accel = {} # {sender_name: [ax, ay, az]}
        
        # Calculated Results
        self.offsets = {} # {sender_name: inv_quaternion}
        self.gyro_biases = {} # {sender_name: [bx, by, bz]}
        self.avg_accels = {} # {sender_name: [ax, ay, az]}
        self.accel_scales = {} # {sender_name: float_scale_factor}
        self.status = "IDLE" # IDLE, SUCCESS, FAILED

    def start_calibration(self):
        print("⚡ CALIBRATION STARTED (3s)...")
        self.state = "COLLECTING"
        self.status = "IDLE" 
        self.start_time = time.time()
        self.buffer_quat = {}
        self.buffer_gyro = {}
        self.buffer_accel = {}

    def is_calibrating(self):
        return self.state == "COLLECTING"

    def process_data(self, sender_name, quat, gyro, accel):
        """
        Collect data during calibration phase.
        Args:
            quat: [w, x, y, z]
            gyro: [gx, gy, gz] (rad/s)
            accel: [ax, ay, az] (m/s^2)
        """
        if self.state != "COLLECTING":
            return

        # 1. Store Quaternion
        if sender_name not in self.buffer_quat:
            self.buffer_quat[sender_name] = []
        self.buffer_quat[sender_name].append(quat)
        
        # 2. Store Gyro
        if sender_name not in self.buffer_gyro:
            self.buffer_gyro[sender_name] = []
        self.buffer_gyro[sender_name].append(gyro)

        # 3. Store Accel
        if sender_name not in self.buffer_accel:
            self.buffer_accel[sender_name] = []
        self.buffer_accel[sender_name].append(accel)

        # Check if 3s has passed
        if time.time() - self.start_time > self.duration:
            success = self.compute_results()
            if success:
                print("✅ CALIBRATION COMPLETED")
                self.state = "CALIBRATED"
                self.status = "SUCCESS"
            else:
                print("❌ CALIBRATION FAILED: Too much movement!")
                self.state = "IDLE" # Reset
                self.status = "FAILED"

    def compute_results(self):
        # 0. Safety Check: Variance (Movement Detection)
        # Threshold: 0.1 m/s^2 variance roughly.
        SAFE_VARIANCE = 0.05 
        for name, accels in self.buffer_accel.items():
            if len(accels) < 10: continue
            var = np.var(accels, axis=0) # [vx, vy, vz]
            magnitude_var = np.linalg.norm(var)
            if magnitude_var > SAFE_VARIANCE:
                print(f"⚠️ {name} Unstable! Variance: {magnitude_var:.4f}")
                return False

        # 1. Compute Quaternion Offsets (Boresighting) - DISABLED
        # Reason: We use EKF Static Alignment (Gravity) instead. 
        # Calculating offset from "arbitrary startup frame" and applying it to "gravity aligned frame" breaks things.
        # for name, quats in self.buffer_quat.items():
            # ... (Logic removed) ...
            
        # 2. Compute Gyro Biases (Static Bias)
        for name, gyros in self.buffer_gyro.items():
            if not gyros: continue
            
            # Mean of static gyro reading = Bias
            bias = np.mean(gyros, axis=0)
            self.gyro_biases[name] = bias

        # 3. Compute Average Accel (for Static Alignment & Gain Calib)
        G_TARGET = 9.81
        for name, accels in self.buffer_accel.items():
            if not accels: continue
            avg_a = np.mean(accels, axis=0)
            self.avg_accels[name] = avg_a
            
            # Gain Calibration: |Avg| should be 9.81.
            norm_a = np.linalg.norm(avg_a)
            if norm_a > 0.1:
                scale = G_TARGET / norm_a
                self.accel_scales[name] = scale
                print(f"⚖️ {name} Accel Scale: {scale:.3f} (Raw Norm: {norm_a:.2f})")
            else:
                self.accel_scales[name] = 1.0

        print(f"Computed Offsets: {list(self.offsets.keys())}")
        print(f"Computed Biases: {list(self.gyro_biases.keys())}")
        return True

    def get_average_accel(self, sender_name):
        return self.avg_accels.get(sender_name, None)

    def get_accel_scale(self, sender_name):
        return self.accel_scales.get(sender_name, 1.0)

    def get_corrected_quat(self, sender_name, curr_quat):
        # Return RAW quaternion (EKF handles alignment now)
        return curr_quat

    def get_corrected_gyro(self, sender_name, raw_gyro):
        # raw_gyro: [gx, gy, gz]
        if sender_name not in self.gyro_biases:
            return raw_gyro
            
        bias = self.gyro_biases[sender_name]
        return raw_gyro - bias
