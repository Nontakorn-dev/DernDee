"""
DernDee v2.0 - ZUPT Gait Estimator
===================================
Based on: ZUPT + Tilt-Rate + Linear Dedrifting Algorithm

This module calculates gait parameters from foot-mounted IMU data.
Only runs when CWTWalkingDetector.is_walking() == True.

Architecture:
    1. Madgwick Filter for orientation (Quaternion)
    2. Rotate Accel to World Frame & remove gravity
    3. Stance Detection with Tilt-Rate check
    4. ZUPT (Zero Velocity Update) during stance
    5. Double Integration with Linear Dedrifting
    6. Extract Parameters (Stride, Speed, Clearance, Symmetry)
"""

import numpy as np
from collections import deque


class MadgwickAHRS:
    """
    Madgwick AHRS (Attitude and Heading Reference System)
    Simplified implementation for orientation tracking.
    """
    
    def __init__(self, sample_rate=100.0, beta=0.1):
        """
        Initialize Madgwick filter.
        
        Args:
            sample_rate: IMU sampling rate in Hz
            beta: Filter gain (higher = faster, noisier; lower = smoother, slower)
        """
        self.sample_rate = sample_rate
        self.beta = beta
        
        # Quaternion [w, x, y, z]
        self.q = np.array([1.0, 0.0, 0.0, 0.0])
    
    def update(self, accel, gyro, dt=None):
        """
        Update orientation estimate with new IMU data.
        
        Args:
            accel: [ax, ay, az] in m/s^2
            gyro: [gx, gy, gz] in rad/s
            dt: Time step (uses 1/sample_rate if None)
            
        Returns:
            np.array: Quaternion [w, x, y, z]
        """
        if dt is None:
            dt = 1.0 / self.sample_rate
        
        q = self.q
        ax, ay, az = accel
        gx, gy, gz = gyro
        
        # Normalize accelerometer
        norm = np.sqrt(ax*ax + ay*ay + az*az)
        if norm < 0.01:
            return self.q
        ax, ay, az = ax/norm, ay/norm, az/norm
        
        # Quaternion derivative from gyroscope
        qDot = 0.5 * np.array([
            -q[1]*gx - q[2]*gy - q[3]*gz,
             q[0]*gx + q[2]*gz - q[3]*gy,
             q[0]*gy - q[1]*gz + q[3]*gx,
             q[0]*gz + q[1]*gy - q[2]*gx
        ])
        
        # Gradient descent step (accelerometer correction)
        # Objective: align estimated gravity with measured gravity
        F = np.array([
            2*(q[1]*q[3] - q[0]*q[2]) - ax,
            2*(q[0]*q[1] + q[2]*q[3]) - ay,
            2*(0.5 - q[1]*q[1] - q[2]*q[2]) - az
        ])
        
        J = np.array([
            [-2*q[2],  2*q[3], -2*q[0],  2*q[1]],
            [ 2*q[1],  2*q[0],  2*q[3],  2*q[2]],
            [ 0,      -4*q[1], -4*q[2],  0     ]
        ])
        
        step = J.T @ F
        step_norm = np.linalg.norm(step)
        if step_norm > 0:
            step = step / step_norm
        
        # Apply correction
        qDot = qDot - self.beta * step
        
        # Integrate
        self.q = q + qDot * dt
        self.q = self.q / np.linalg.norm(self.q)
        
        return self.q
    
    def get_quaternion(self):
        """Get current quaternion [w, x, y, z]."""
        return self.q.copy()
    
    def initialize_orientation(self, ax, ay, az):
        """
        Initialize orientation from gravity vector (Instant Alignment).
        
        Call this after calibration to set initial orientation immediately,
        avoiding the slow Madgwick convergence warm-up period.
        
        Args:
            ax, ay, az: Average accelerometer readings during calibration (m/s^2)
                       These should already be axis-remapped.
        
        Algorithm (Aerospace Z-Y-X convention):
            1. Normalize accel vector
            2. Compute Roll (phi) and Pitch (theta) from gravity
            3. Convert to quaternion (Yaw = 0)
        """
        # 1. Normalize accelerometer
        norm = np.sqrt(ax*ax + ay*ay + az*az)
        if norm < 0.1:
            print("⚠️ [MADGWICK] Cannot initialize - accel too weak")
            return
        
        ax_n = ax / norm
        ay_n = ay / norm
        az_n = az / norm
        
        # 2. Calculate Roll & Pitch (Aerospace convention)
        # Pitch (θ) = arctan2(-ax, sqrt(ay² + az²))
        # Roll (φ) = arctan2(ay, az)
        pitch = np.arctan2(-ax_n, np.sqrt(ay_n*ay_n + az_n*az_n))
        roll = np.arctan2(ay_n, az_n)
        yaw = 0.0  # We don't know heading from gravity alone
        
        # 3. Convert to Quaternion (Roll-Pitch-Yaw order, ZYX)
        # Using half-angles
        cr = np.cos(roll / 2)
        sr = np.sin(roll / 2)
        cp = np.cos(pitch / 2)
        sp = np.sin(pitch / 2)
        cy = np.cos(yaw / 2)
        sy = np.sin(yaw / 2)
        
        # Quaternion from Euler (ZYX convention)
        qw = cr * cp * cy + sr * sp * sy
        qx = sr * cp * cy - cr * sp * sy
        qy = cr * sp * cy + sr * cp * sy
        qz = cr * cp * sy - sr * sp * cy
        
        # Force-set quaternion
        self.q = np.array([qw, qx, qy, qz])
        
        # Normalize (safety)
        self.q = self.q / np.linalg.norm(self.q)
        
        print(f"⚡ [MADGWICK] Instant Alignment: Roll={np.degrees(roll):.1f}°, Pitch={np.degrees(pitch):.1f}°")
        print(f"   Quaternion: [{qw:.4f}, {qx:.4f}, {qy:.4f}, {qz:.4f}]")
    
    def reset(self):
        """Reset to identity orientation."""
        self.q = np.array([1.0, 0.0, 0.0, 0.0])


class ZUPTGaitEstimator:
    """
    ZUPT-based Gait Parameter Estimator - The Worker Layer
    
    Only activated when CWTWalkingDetector confirms walking.
    Calculates stride length, speed, clearance using ZUPT + Linear Dedrifting.
    """
    
    def __init__(self, sample_rate=100.0):
        """
        Initialize ZUPT Gait Estimator.
        
        Args:
            sample_rate: IMU sampling rate in Hz
        """
        self.sample_rate = sample_rate
        self.dt = 1.0 / sample_rate
        
        # ==== Madgwick Filter ====
        self.ahrs = MadgwickAHRS(sample_rate=sample_rate, beta=0.1)
        
        # ==== Stance Detection Parameters ====
        self.gyro_threshold = 0.2  # rad/s - increased for faster ZUPT (was 0.2)
        self.tilt_rate_threshold = 5.24  # rad/s^2 (~300 deg/s^2) - toe-off detection
        
        # ==== State ====
        self.is_stance = True
        self.was_stance = True
        
        # ==== Trajectory State ====
        self.position = np.zeros(3)  # [x, y, z] in meters
        self.velocity = np.zeros(3)  # [vx, vy, vz] in m/s
        
        # ==== Step Tracking ====
        self.step_start_time = None
        self.step_start_pos = np.zeros(3)
        self.swing_accel_history = []  # For dedrifting
        self.swing_velocity_history = []  # For dedrifting
        self.swing_time_history = []  # For dedrifting
        
        # ==== Results ====
        self.last_stride_length = 0.0
        self.last_clearance = 0.0
        self.last_speed = 0.0
        self.total_steps = 0
        
        # ==== Gyro Norm History (for tilt-rate) ====
        self.gyro_norm_history = deque(maxlen=5)
        self.last_gyro_norm = 0.0
        
        # ==== Z-position tracking for clearance ====
        self.max_z_in_swing = 0.0
        self.ground_z = 0.0  # Reference ground level
        
        # ==== NEW: Virtual Coach Metrics ====
        self.swing_gyro_history = []      # For tracking gyro during swing
        self.swing_q_history = []         # For tracking quaternion during swing (for World Frame)
        self.max_forward_velocity = 0.0   # For push-off velocity
        self.touchdown_pitch = 0.0        # Pitch angle at heel strike (degrees)
        self.max_yaw_rate = 0.0           # Max yaw rate during swing (rad/s) - WORLD FRAME
        self.standing_pitch = 0.0         # Shoe inclination offset from calibration (degrees)
        
    def rotate_to_world(self, q, accel_local):
        """
        Rotate acceleration from local (body) frame to world frame.
        
        Args:
            q: Quaternion [w, x, y, z]
            accel_local: Acceleration in body frame [ax, ay, az]
            
        Returns:
            np.array: Acceleration in world frame [ax, ay, az]
        """
        # Quaternion rotation: v_world = q * v_local * q^(-1)
        w, x, y, z = q
        
        # Rotation matrix from quaternion
        R = np.array([
            [1 - 2*(y*y + z*z),     2*(x*y - w*z),     2*(x*z + w*y)],
            [    2*(x*y + w*z), 1 - 2*(x*x + z*z),     2*(y*z - w*x)],
            [    2*(x*z - w*y),     2*(y*z + w*x), 1 - 2*(x*x + y*y)]
        ])
        
        return R @ accel_local
    
    def get_world_gyro_z(self, q, gyro):
        """
        Extract ONLY the Z-component of Gyro in World Frame.
        This makes Circumduction detection robust to sensor misalignment.
        
        Args:
            q: Quaternion [w, x, y, z]
            gyro: Gyroscope data [gx, gy, gz] in rad/s
            
        Returns:
            float: World Frame Gyro Z (yaw rate around vertical axis)
        """
        w, x, y, z = q
        gx, gy, gz = gyro[0], gyro[1], gyro[2]
        
        # Extract row 3 of rotation matrix R(q)
        # R[2,:] = [ 2(xz - wy),  2(yz + wx),  1 - 2(x² + y²) ]
        r31 = 2 * (x * z - w * y)
        r32 = 2 * (y * z + w * x)
        r33 = 1 - 2 * (x * x + y * y)
        
        # World Z = R[2,:] · gyro
        world_gz = (r31 * gx) + (r32 * gy) + (r33 * gz)
        return world_gz
    
    def get_pitch_angle(self, q):
        """
        Calculate pitch angle from quaternion.
        
        Args:
            q: Quaternion [w, x, y, z]
            
        Returns:
            float: Pitch angle in degrees
        """
        w, x, y, z = q
        # Pitch (θ) = atan2(2(wy - zx), 1 - 2(x² + y²))
        pitch_rad = np.arctan2(2*(w*y - z*x), 1 - 2*(x*x + y*y))
        return np.degrees(pitch_rad)
    
    def detect_stance(self, gyro_norm, current_time_ms):
        """
        Detect stance phase using gyro norm and tilt-rate.
        
        Start Stance: gyro_norm < 0.2 rad/s
        End Stance (Toe-Off): tilt-rate > 300 deg/s²
        
        Args:
            gyro_norm: Current gyro magnitude in rad/s
            current_time_ms: Current timestamp
            
        Returns:
            tuple: (is_stance, is_toe_off)
        """
        # Calculate tilt-rate (slope of gyro_norm)
        tilt_rate = 0.0
        if len(self.gyro_norm_history) >= 2:
            dt_samples = len(self.gyro_norm_history) * self.dt
            tilt_rate = (gyro_norm - self.gyro_norm_history[0]) / dt_samples
        
        self.gyro_norm_history.append(gyro_norm)
        self.last_gyro_norm = gyro_norm
        
        # Stance detection logic
        is_toe_off = False
        
        if self.is_stance:
            # Currently in stance - check for toe-off
            if tilt_rate > self.tilt_rate_threshold:
                # High tilt-rate = toe-off detected
                is_toe_off = True
                self.is_stance = False
                print(f"👟 [ESTIMATOR] Toe-Off detected (tilt_rate={tilt_rate:.1f} rad/s²)")
        else:
            # Currently in swing - check for heel-strike (return to stance)
            if gyro_norm < self.gyro_threshold:
                self.is_stance = True
                print(f"🦶 [ESTIMATOR] Heel-Strike detected (gyro_norm={gyro_norm:.2f} rad/s)")
        
        return self.is_stance, is_toe_off
    
    def linear_dedrift(self, velocity_history, time_history):
        """
        Apply linear dedrifting to velocity.
        Removes accumulated drift by linearly interpolating error.
        
        v_corrected(t) = v_raw(t) - v_error * (t - t_start) / (t_end - t_start)
        
        Args:
            velocity_history: List of velocity vectors during swing
            time_history: List of timestamps
            
        Returns:
            list: Corrected velocity history
        """
        if len(velocity_history) < 2:
            return velocity_history
        
        # Error at end of swing (should be zero at heel-strike)
        v_error = velocity_history[-1].copy()
        
        t_start = time_history[0]
        t_end = time_history[-1]
        duration = t_end - t_start
        
        if duration <= 0:
            return velocity_history
        
        corrected = []
        for i, (v, t) in enumerate(zip(velocity_history, time_history)):
            alpha = (t - t_start) / duration
            v_corrected = v - v_error * alpha
            corrected.append(v_corrected)
        
        return corrected
    
    def update(self, accel, gyro, timestamp_ms, dt=None, is_walking=True):
        """
        Main update function - process one IMU sample.
        
        Args:
            accel: [ax, ay, az] in m/s^2
            gyro: [gx, gy, gz] in rad/s
            timestamp_ms: Current timestamp in milliseconds
            dt: Real time delta in seconds (if None, uses self.dt)
            is_walking: Whether CWT detector confirms walking
            
        Returns:
            dict or None: Gait parameters if step completed, None otherwise
        """
        # Convert to numpy
        accel = np.array(accel)
        gyro = np.array(gyro)
        
        # [FIX] Use real dt if provided, otherwise fallback to self.dt
        if dt is None:
            dt = self.dt
        
        # 1. Update Orientation (Madgwick) - pass real dt!
        q = self.ahrs.update(accel, gyro, dt)
        
        # 2. Calculate Gyro Norm
        gyro_norm = np.linalg.norm(gyro)
        
        # 3. Rotate Accel to World Frame & Remove Gravity
        accel_world = self.rotate_to_world(q, accel)
        accel_linear = accel_world.copy()
        accel_linear[2] -= 9.81  # Remove gravity (Z-up)
        
        # 4. Stance Detection
        self.was_stance = self.is_stance
        is_stance, is_toe_off = self.detect_stance(gyro_norm, timestamp_ms)
        
        result = None
        
        # 5. ZUPT Logic
        if is_stance:
            # Zero Velocity Update
            self.velocity = np.zeros(3)
            
            # If just transitioned to stance (heel-strike) - calculate step
            if not self.was_stance and len(self.swing_velocity_history) > 5:
                # Apply Linear Dedrifting
                corrected_velocities = self.linear_dedrift(
                    self.swing_velocity_history,
                    self.swing_time_history
                )
                
                # === RE-INTEGRATION (per SRS) ===
                # Create fresh trajectory from corrected velocities
                # This avoids using drifted real-time max_z
                
                # 1. Initialize temporary variables
                temp_z = 0.0           # Z position (starts at 0 each step)
                max_z_final = 0.0      # Correct max clearance
                final_pos = self.step_start_pos.copy()  # For stride length
                
                # 2. Loop: Re-integrate corrected velocities
                for v in corrected_velocities:
                    # A. Accumulate XY position (for stride length)
                    final_pos += v * dt
                    
                    # B. Accumulate Z height (relative, starts at 0)
                    temp_z += v[2] * dt
                    
                    # C. Track maximum Z (peak detection)
                    if temp_z > max_z_final:
                        max_z_final = temp_z
                
                # Calculate Stride Length (horizontal distance)
                dx = final_pos[0] - self.step_start_pos[0]
                dy = final_pos[1] - self.step_start_pos[1]
                stride_length = np.sqrt(dx*dx + dy*dy)
                
                # 3. Use RE-INTEGRATED max_z for clearance (NOT the drifted one!)
                clearance = max_z_final
                
                # Calculate Speed
                step_duration = (timestamp_ms - self.step_start_time) / 1000.0 if self.step_start_time else 1.0
                speed = stride_length / step_duration if step_duration > 0 else 0.0
                
                # Validate and store
                if 0.1 < stride_length < 2.0:  # Reasonable stride (10cm - 2m)
                    self.last_stride_length = stride_length
                    self.last_clearance = max(0, clearance)
                    self.last_speed = speed
                    self.total_steps += 1
                    
                    # === NEW: Compute Virtual Coach Metrics ===
                    # 1. Touch-down Pitch Angle (RELATIVE to standing position)
                    raw_pitch = self.get_pitch_angle(q)
                    # Subtract shoe inclination to get real foot pitch
                    real_foot_pitch = raw_pitch - self.standing_pitch
                    self.touchdown_pitch = real_foot_pitch
                    
                    # 2. Push-off Velocity (max forward velocity during step)
                    push_off_velocity = self.max_forward_velocity
                    
                    # 3. Max Yaw Rate during swing
                    yaw_rate = self.max_yaw_rate
                    
                    result = {
                        'stride_length_m': stride_length,
                        'clearance_m': max(0, clearance),
                        'speed_mps': speed,
                        'step_duration_s': step_duration,
                        'step_count': self.total_steps,
                        # NEW: Virtual Coach Metrics
                        'touchdown_pitch_deg': self.touchdown_pitch,
                        'push_off_velocity_mps': push_off_velocity,
                        'max_yaw_rate_rps': yaw_rate
                    }
                    
                    print(f"✨ [STEP #{self.total_steps}] Stride: {stride_length*100:.1f}cm | Pitch: {self.touchdown_pitch:.1f}° | Yaw: {yaw_rate:.2f}r/s")
                
                # Reset for next step
                self.position = np.zeros(3)
                self.ground_z = 0.0
            
            # Update step start reference
            self.step_start_pos = self.position.copy()
            self.step_start_time = timestamp_ms
            self.swing_accel_history = []
            self.swing_velocity_history = []
            self.swing_time_history = []
            self.swing_gyro_history = []   # Reset gyro history
            self.swing_q_history = []      # Reset quaternion history
            self.max_z_in_swing = 0.0
            self.max_forward_velocity = 0.0
            self.max_yaw_rate = 0.0
            
        else:
            # Swing Phase - Integrate
            if is_walking:
                # Save previous velocity for trapezoidal integration
                vel_prev = self.velocity.copy()
                
                # Integrate acceleration to velocity (Euler - fine for accel→vel)
                self.velocity += accel_linear * dt
                
                # Store for dedrifting
                self.swing_velocity_history.append(self.velocity.copy())
                self.swing_accel_history.append(accel_linear.copy())
                self.swing_time_history.append(timestamp_ms)
                
                # Integrate velocity to position using TRAPEZOIDAL method
                # pos += (vel_prev + vel_curr) * 0.5 * dt (more accurate than Euler)
                self.position += (vel_prev + self.velocity) * 0.5 * dt
                
                # Track max Z for clearance
                if self.position[2] > self.max_z_in_swing:
                    self.max_z_in_swing = self.position[2]
                
                # === Track Virtual Coach Metrics ===
                # Track max forward velocity (for push-off)
                if self.velocity[0] > self.max_forward_velocity:
                    self.max_forward_velocity = self.velocity[0]
                
                # Store gyro and quaternion for World Frame yaw calculation at step end
                self.swing_gyro_history.append(gyro.copy() if hasattr(gyro, 'copy') else list(gyro))
                self.swing_q_history.append(q.copy() if hasattr(q, 'copy') else list(q))
                
                # Track max yaw rate using WORLD FRAME Z (robust to sensor misalignment)
                world_gz = self.get_world_gyro_z(q, gyro)
                if abs(world_gz) > self.max_yaw_rate:
                    self.max_yaw_rate = abs(world_gz)
        
        return result
    
    def get_current_state(self):
        """
        Get current estimator state for debugging.
        
        Returns:
            dict: Current state info
        """
        return {
            'is_stance': self.is_stance,
            'position': self.position.tolist(),
            'velocity': self.velocity.tolist(),
            'quaternion': self.ahrs.get_quaternion().tolist(),
            'gyro_norm': self.last_gyro_norm,
            'total_steps': self.total_steps
        }
    
    def initialize_orientation(self, ax, ay, az):
        """
        Initialize orientation from gravity vector (Instant Alignment).
        
        Call this after calibration to:
        1. Set Madgwick quaternion from gravity (no warm-up needed)
        2. Reset all trajectory state to zero
        
        Args:
            ax, ay, az: Average accelerometer from calibration (m/s^2)
                       These should already be axis-remapped.
        """
        # 1. Initialize Madgwick orientation from gravity
        self.ahrs.initialize_orientation(ax, ay, az)
        
        # 2. Reset all trajectory state (per SRS Section 2.3)
        self.velocity = np.zeros(3)
        self.position = np.zeros(3)
        self.ground_z = 0.0
        
        # 3. Reset step tracking
        self.is_stance = True
        self.was_stance = True
        self.step_start_time = None
        self.step_start_pos = np.zeros(3)
        self.swing_accel_history = []
        self.swing_velocity_history = []
        self.swing_time_history = []
        self.gyro_norm_history.clear()
        self.max_z_in_swing = 0.0
        
        # 4. [NEW] Record shoe inclination as Pitch offset
        # This is the pitch angle when standing flat - used for relative pitch calculation
        self.standing_pitch = self.get_pitch_angle(self.ahrs.get_quaternion())
        
        # Note: We do NOT reset total_steps or stride history
        # so user can see cumulative stats across calibrations
        
        print(f"👟 [CALIBRATION] Shoe Inclination Offset: {self.standing_pitch:.2f}°")
        print("✅ [ESTIMATOR] Instant Alignment complete - ready to walk!")
    
    def reset(self):
        """Reset estimator state."""
        self.ahrs.reset()
        self.is_stance = True
        self.was_stance = True
        self.position = np.zeros(3)
        self.velocity = np.zeros(3)
        self.step_start_time = None
        self.step_start_pos = np.zeros(3)
        self.swing_accel_history = []
        self.swing_velocity_history = []
        self.swing_time_history = []
        self.gyro_norm_history.clear()
        self.last_stride_length = 0.0
        self.last_clearance = 0.0
        self.last_speed = 0.0
        self.total_steps = 0
        self.max_z_in_swing = 0.0
        self.ground_z = 0.0
        print("🔄 ZUPTGaitEstimator Reset")


class DualFootAnalyzer:
    """
    Combines data from both feet for symmetry analysis.
    """
    
    def __init__(self):
        self.left_strides = deque(maxlen=20)
        self.right_strides = deque(maxlen=20)
        self.left_clearances = deque(maxlen=20)
        self.right_clearances = deque(maxlen=20)
    
    def add_step(self, side, stride_length, clearance):
        """
        Add a step measurement.
        
        Args:
            side: 'L' or 'R'
            stride_length: Stride length in meters
            clearance: Foot clearance in meters
        """
        if side == 'L':
            self.left_strides.append(stride_length)
            self.left_clearances.append(clearance)
        else:
            self.right_strides.append(stride_length)
            self.right_clearances.append(clearance)
    
    def get_symmetry(self):
        """
        Calculate gait symmetry.
        
        Symmetry = 100 * min(L, R) / max(L, R)
        100% = perfect symmetry
        
        Returns:
            float: Symmetry percentage (0-100)
        """
        if len(self.left_strides) < 1 or len(self.right_strides) < 1:
            return 100.0
        
        avg_left = np.mean(self.left_strides)
        avg_right = np.mean(self.right_strides)
        
        if max(avg_left, avg_right) < 0.01:
            return 100.0
        
        symmetry = 100 * min(avg_left, avg_right) / max(avg_left, avg_right)
        return symmetry
    
    def get_clearance_warning(self, threshold_cm=2.0):
        """
        Check if foot clearance is dangerously low.
        
        Args:
            threshold_cm: Warning threshold in cm
            
        Returns:
            dict or None: Warning info if low clearance detected
        """
        threshold_m = threshold_cm / 100.0
        
        for side, clearances in [('L', self.left_clearances), ('R', self.right_clearances)]:
            if len(clearances) >= 2:
                avg_clearance = np.mean(list(clearances)[-3:])
                if avg_clearance < threshold_m:
                    return {
                        'side': side,
                        'clearance_cm': avg_clearance * 100,
                        'warning': f"⚠️ ยกเท้า{'ซ้าย' if side == 'L' else 'ขวา'}ต่ำ ({avg_clearance*100:.1f}cm)"
                    }
        
        return None
    
    def reset(self):
        """Reset analyzer state."""
        self.left_strides.clear()
        self.right_strides.clear()
        self.left_clearances.clear()
        self.right_clearances.clear()


# Convenience alias
GaitEstimator = ZUPTGaitEstimator
