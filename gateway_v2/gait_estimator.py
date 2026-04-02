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
    
    def __init__(self, sample_rate=100.0, sensor_mount="foot"):
        """
        Initialize ZUPT Gait Estimator.
        
        Args:
            sample_rate: IMU sampling rate in Hz
        """
        self.sample_rate = sample_rate
        self.sensor_mount = sensor_mount.lower()
        self.dt = 1.0 / sample_rate
        
        # ==== Madgwick Filter ====
        self.ahrs = MadgwickAHRS(sample_rate=sample_rate, beta=0.1)
        
        # ==== Stance Detection Parameters ====
        self.gyro_threshold = 0.2  # rad/s - heel-strike low-gyro threshold
        self.tilt_rate_threshold = 5.24  # rad/s^2 (~300 deg/s^2) - toe-off detection
        self.min_toe_off_gyro_norm = 0.25
        self.min_swing_peak_gyro_norm = 0.5
        self.min_stance_duration_s = 0.08
        self.min_swing_duration_s = 0.18
        self.toe_off_confirm_samples = 2
        self.heel_strike_confirm_samples = 3

        # Shank-mounted IMUs have broader motion arcs and often cross low-gyro
        # regions during mid-swing, so heel-strike needs stronger confirmation.
        if self.sensor_mount == "shank":
            self.gyro_threshold = 0.18
            self.min_toe_off_gyro_norm = 0.30
            self.min_swing_peak_gyro_norm = 0.75
            self.min_stance_duration_s = 0.10
            self.min_swing_duration_s = 0.24
            self.toe_off_confirm_samples = 2
            self.heel_strike_confirm_samples = 4
        
        # ==== State ====
        self.is_stance = True
        self.was_stance = True
        self.stance_start_time_ms = None
        self.swing_start_time_ms = None
        self.toe_off_candidate_count = 0
        self.heel_strike_candidate_count = 0
        self.swing_peak_gyro_norm = 0.0
        
        # ==== Trajectory State ====
        self.position = np.zeros(3)  # [x, y, z] in meters
        self.velocity = np.zeros(3)  # [vx, vy, vz] in m/s
        
        # ==== Step Tracking ====
        self.step_start_pos = np.zeros(3)
        self.stride_start_time_ms = None      # Same-foot heel-strike that started the current stride
        self.toe_off_time_ms = None           # Toe-off that started the current swing
        self.heel_strike_time_ms = None       # Most recent heel-strike timestamp
        self.swing_accel_history = []  # For dedrifting
        self.swing_velocity_history = []  # For dedrifting
        self.swing_time_history = []  # For dedrifting
        self.swing_dt_history = []  # Real dt per swing sample
        
        # ==== Results ====
        self.last_stride_length = 0.0
        self.last_clearance = 0.0
        self.last_speed = 0.0
        self.total_steps = 0
        self.recent_valid_strides = deque(maxlen=6)
        self.last_reject_reason = None
        
        # ==== Gyro Norm History (for tilt-rate) ====
        self.gyro_norm_history = deque(maxlen=5)
        self.gyro_time_history = deque(maxlen=5)
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
        # Pitch (θ) in ZYX convention = asin(2(wy - zx))
        sin_pitch = 2 * (w * y - z * x)
        sin_pitch = np.clip(sin_pitch, -1.0, 1.0)
        pitch_rad = np.arcsin(sin_pitch)
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
        if len(self.gyro_norm_history) >= 2 and len(self.gyro_time_history) >= 2:
            ref_gyro = self.gyro_norm_history[0]
            ref_time_ms = self.gyro_time_history[0]
            dt_sec = (current_time_ms - ref_time_ms) / 1000.0
            if dt_sec > 0:
                tilt_rate = (gyro_norm - ref_gyro) / dt_sec

        self.gyro_norm_history.append(gyro_norm)
        self.gyro_time_history.append(current_time_ms)
        self.last_gyro_norm = gyro_norm
        
        if self.is_stance and self.stance_start_time_ms is None:
            self.stance_start_time_ms = current_time_ms
        if (not self.is_stance) and self.swing_start_time_ms is None:
            self.swing_start_time_ms = current_time_ms

        # Stance detection logic
        is_toe_off = False
        
        if self.is_stance:
            # Currently in stance - check for toe-off
            stance_duration_s = self._duration_s(self.stance_start_time_ms, current_time_ms) or 0.0
            toe_off_candidate = (
                stance_duration_s >= self.min_stance_duration_s and
                tilt_rate > self.tilt_rate_threshold and
                gyro_norm >= self.min_toe_off_gyro_norm
            )

            if toe_off_candidate:
                self.toe_off_candidate_count += 1
            else:
                self.toe_off_candidate_count = 0

            self.heel_strike_candidate_count = 0

            if self.toe_off_candidate_count >= self.toe_off_confirm_samples:
                # High tilt-rate + sustained motion = toe-off detected
                is_toe_off = True
                self.is_stance = False
                self.swing_start_time_ms = current_time_ms
                self.swing_peak_gyro_norm = gyro_norm
                self.toe_off_candidate_count = 0
                print(f"👟 [ESTIMATOR] Toe-Off detected (tilt_rate={tilt_rate:.1f} rad/s²)")
        else:
            # Currently in swing - check for heel-strike (return to stance)
            self.swing_peak_gyro_norm = max(self.swing_peak_gyro_norm, gyro_norm)
            swing_duration_s = self._duration_s(self.swing_start_time_ms, current_time_ms) or 0.0
            heel_strike_candidate = (
                swing_duration_s >= self.min_swing_duration_s and
                self.swing_peak_gyro_norm >= self.min_swing_peak_gyro_norm and
                gyro_norm < self.gyro_threshold
            )

            if heel_strike_candidate:
                self.heel_strike_candidate_count += 1
            else:
                self.heel_strike_candidate_count = 0

            self.toe_off_candidate_count = 0

            if self.heel_strike_candidate_count >= self.heel_strike_confirm_samples:
                self.is_stance = True
                self.stance_start_time_ms = current_time_ms
                self.heel_strike_candidate_count = 0
                print(f"🦶 [ESTIMATOR] Heel-Strike detected (gyro_norm={gyro_norm:.2f} rad/s)")
        
        return self.is_stance, is_toe_off

    def reset_bout_state(self):
        """Reset phase-tracking and transient integration state for a fresh walking bout."""
        self.is_stance = True
        self.was_stance = True
        self.position = np.zeros(3)
        self.velocity = np.zeros(3)
        self.step_start_pos = np.zeros(3)
        self.stance_start_time_ms = None
        self.swing_start_time_ms = None
        self.stride_start_time_ms = None
        self.toe_off_time_ms = None
        self.heel_strike_time_ms = None
        self.toe_off_candidate_count = 0
        self.heel_strike_candidate_count = 0
        self.swing_peak_gyro_norm = 0.0
        self.swing_accel_history = []
        self.swing_velocity_history = []
        self.swing_time_history = []
        self.swing_dt_history = []
        self.swing_gyro_history = []
        self.swing_q_history = []
        self.gyro_norm_history.clear()
        self.gyro_time_history.clear()
        self.last_gyro_norm = 0.0
        self.max_z_in_swing = 0.0
        self.ground_z = 0.0
        self.max_forward_velocity = 0.0
        self.touchdown_pitch = 0.0
        self.max_yaw_rate = 0.0
    
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

    def _duration_s(self, start_time_ms, end_time_ms):
        """Convert timestamp delta to seconds when both timestamps are valid."""
        if start_time_ms is None or end_time_ms is None:
            return None

        duration_ms = end_time_ms - start_time_ms
        if duration_ms <= 0:
            return None

        return duration_ms / 1000.0

    def _get_validation_profile(self):
        """Return mount-specific plausibility thresholds for completed steps."""
        is_shank = self.sensor_mount == "shank"
        return {
            "stride_min": 0.08 if is_shank else 0.10,
            "stride_max": 1.80 if is_shank else 1.50,
            "clearance_max": 1.20 if is_shank else 0.40,
            "swing_min": 0.10 if is_shank else 0.15,
            "swing_max": 2.00 if is_shank else 1.50,
            "stride_duration_min": 0.25 if is_shank else 0.30,
            "stride_duration_max": 3.50 if is_shank else 3.00,
            "speed_min": 0.03 if is_shank else 0.05,
            "speed_max": 3.20 if is_shank else 2.50,
            "history_required": 5 if is_shank else 3,
            "lower_scale": 0.35 if is_shank else 0.50,
            "upper_scale": 2.50 if is_shank else 1.80,
            "absolute_lower": 0.08 if is_shank else 0.12,
        }

    def _should_rollback_heel_strike(self, reason, stride_length, speed, swing_duration_s):
        """
        Decide whether an invalid completed-step candidate should be treated as a
        false heel-strike so the swing can continue instead of being truncated.
        """
        profile = self._get_validation_profile()

        if reason == "swing_duration_out_of_range" and swing_duration_s is not None:
            return swing_duration_s < profile["swing_min"]
        if reason == "stride_out_of_range":
            return stride_length < profile["stride_min"]
        if reason == "speed_out_of_range" and speed is not None:
            return speed < profile["speed_min"]

        return False

    def _rollback_false_heel_strike(self, reason, velocity_before_zupt):
        """Undo a spurious heel-strike so integration can continue in swing."""
        self.is_stance = False
        self.was_stance = False
        self.stance_start_time_ms = None
        self.heel_strike_candidate_count = 0
        self.velocity = velocity_before_zupt
        self.last_reject_reason = reason
        print(f"↩️ [ESTIMATOR] False heel-strike ignored - continue swing ({reason})")

    def _can_accept_spatial_step_with_unreliable_timing(self, reason, stride_length, clearance):
        """
        Shank-mounted IMUs can produce usable spatial metrics even when temporal
        phase timing is noisy. Accept these steps but drop timing-derived outputs.
        """
        if self.sensor_mount != "shank":
            return False
        if reason not in {"swing_duration_out_of_range", "stride_duration_out_of_range", "speed_out_of_range"}:
            return False
        if not np.isfinite(stride_length) or not (0.12 <= stride_length <= 1.20):
            return False
        if not np.isfinite(clearance) or not (0.0 <= clearance <= 0.25):
            return False
        return True

    def _validate_step_metrics(self, stride_length, clearance, speed, swing_duration_s, stride_duration_s):
        """
        Reject obviously implausible gait metrics before they pollute session averages.

        Returns:
            tuple[bool, str]: (is_valid, reason)
        """
        profile = self._get_validation_profile()
        stride_min = profile["stride_min"]
        stride_max = profile["stride_max"]
        clearance_max = profile["clearance_max"]
        swing_min = profile["swing_min"]
        swing_max = profile["swing_max"]
        stride_duration_min = profile["stride_duration_min"]
        stride_duration_max = profile["stride_duration_max"]
        speed_min = profile["speed_min"]
        speed_max = profile["speed_max"]
        history_required = profile["history_required"]
        lower_scale = profile["lower_scale"]
        upper_scale = profile["upper_scale"]
        absolute_lower = profile["absolute_lower"]
        absolute_upper = stride_max

        if not np.isfinite(stride_length) or stride_length <= 0:
            return False, "invalid_stride"
        if not (stride_min <= stride_length <= stride_max):
            return False, "stride_out_of_range"

        if not np.isfinite(clearance) or clearance < 0:
            return False, "invalid_clearance"
        if clearance > clearance_max:
            return False, "clearance_out_of_range"

        if swing_duration_s is not None:
            if not np.isfinite(swing_duration_s) or not (swing_min <= swing_duration_s <= swing_max):
                return False, "swing_duration_out_of_range"

        if stride_duration_s is not None:
            if not np.isfinite(stride_duration_s) or not (stride_duration_min <= stride_duration_s <= stride_duration_max):
                return False, "stride_duration_out_of_range"

        if speed is not None:
            if not np.isfinite(speed) or not (speed_min <= speed <= speed_max):
                return False, "speed_out_of_range"

        if len(self.recent_valid_strides) >= history_required:
            median_stride = float(np.median(self.recent_valid_strides))
            lower_bound = max(absolute_lower, median_stride * lower_scale)
            upper_bound = min(absolute_upper, max(0.35, median_stride * upper_scale))
            if not (lower_bound <= stride_length <= upper_bound):
                return False, "stride_outlier_vs_recent_history"

        return True, ""

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
        just_toe_off = self.was_stance and not is_stance
        just_heel_strike = (not self.was_stance) and is_stance

        result = None

        # 5. ZUPT Logic
        if just_toe_off:
            self.toe_off_time_ms = timestamp_ms
            self.step_start_pos = self.position.copy()
            self.swing_accel_history = []
            self.swing_velocity_history = []
            self.swing_time_history = []
            self.swing_dt_history = []
            self.swing_gyro_history = []
            self.swing_q_history = []
            self.max_z_in_swing = 0.0
            self.max_forward_velocity = 0.0
            self.max_yaw_rate = 0.0

        if is_stance:
            if just_heel_strike and len(self.swing_velocity_history) <= 5:
                self._rollback_false_heel_strike("swing_too_short_for_step", self.velocity.copy())
                return None

            # If just transitioned to stance (heel-strike) - calculate step
            if just_heel_strike and len(self.swing_velocity_history) > 5:
                velocity_before_zupt = self.velocity.copy()

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
                prev_v = np.zeros(3)
                
                # 2. Loop: Re-integrate corrected velocities with per-sample dt
                for v, sample_dt in zip(corrected_velocities, self.swing_dt_history):
                    if sample_dt <= 0:
                        continue

                    # A. Accumulate XY position (for stride length)
                    final_pos += (prev_v + v) * 0.5 * sample_dt
                    
                    # B. Accumulate Z height (relative, starts at 0)
                    temp_z += (prev_v[2] + v[2]) * 0.5 * sample_dt
                    
                    # C. Track maximum Z (peak detection)
                    if temp_z > max_z_final:
                        max_z_final = temp_z

                    prev_v = v
                
                # Calculate Stride Length (horizontal distance)
                dx = final_pos[0] - self.step_start_pos[0]
                dy = final_pos[1] - self.step_start_pos[1]
                stride_length = np.sqrt(dx*dx + dy*dy)
                
                # 3. Use RE-INTEGRATED max_z for clearance (NOT the drifted one!)
                clearance = max_z_final
                
                heel_strike_time_ms = timestamp_ms
                stride_duration_s = self._duration_s(self.stride_start_time_ms, heel_strike_time_ms)
                swing_duration_s = self._duration_s(self.toe_off_time_ms, heel_strike_time_ms)
                stance_duration_s = self._duration_s(self.stride_start_time_ms, self.toe_off_time_ms)

                # Speed over the full stride is more biomechanically meaningful here.
                speed = stride_length / stride_duration_s if stride_duration_s else None
                
                is_valid_step, invalid_reason = self._validate_step_metrics(
                    stride_length,
                    clearance,
                    speed,
                    swing_duration_s,
                    stride_duration_s,
                )

                if (not is_valid_step) and self._can_accept_spatial_step_with_unreliable_timing(
                    invalid_reason,
                    stride_length,
                    clearance,
                ):
                    print(
                        "⚠️ [ESTIMATOR] Accepting shank step with unreliable timing "
                        f"(reason={invalid_reason})"
                    )
                    speed = None
                    stride_duration_s = None
                    swing_duration_s = None
                    stance_duration_s = None
                    is_valid_step = True
                    invalid_reason = None

                # Validate and store
                if is_valid_step:
                    self.last_reject_reason = None
                    self.last_stride_length = stride_length
                    self.last_clearance = max(0, clearance)
                    if speed is not None:
                        self.last_speed = speed
                    self.total_steps += 1
                    self.recent_valid_strides.append(stride_length)
                    
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
                        'step_duration_s': None,  # Filled by dual-foot aggregator in main.py
                        'stride_duration_s': stride_duration_s,
                        'swing_duration_s': swing_duration_s,
                        'stance_duration_s': stance_duration_s,
                        'step_count': self.total_steps,
                        # NEW: Virtual Coach Metrics
                        'touchdown_pitch_deg': self.touchdown_pitch,
                        'push_off_velocity_mps': push_off_velocity,
                        'max_yaw_rate_rps': yaw_rate,
                        'stride_start_time_ms': self.stride_start_time_ms,
                        'toe_off_time_ms': self.toe_off_time_ms,
                        'heel_strike_time_ms': heel_strike_time_ms
                    }
                    
                    print(f"✨ [STEP #{self.total_steps}] Stride: {stride_length*100:.1f}cm | Pitch: {self.touchdown_pitch:.1f}° | Yaw: {yaw_rate:.2f}r/s")
                else:
                    self.last_reject_reason = invalid_reason
                    print(
                        f"⚠️ [ESTIMATOR] Rejected step: stride={stride_length*100:.1f}cm "
                        f"clearance={max(0, clearance)*100:.1f}cm "
                        f"speed={'--' if speed is None else f'{speed:.2f}m/s'} "
                        f"reason={invalid_reason}"
                    )

                    if self._should_rollback_heel_strike(
                        invalid_reason,
                        stride_length,
                        speed,
                        swing_duration_s,
                    ):
                        self._rollback_false_heel_strike(invalid_reason, velocity_before_zupt)
                        return None
                
                # Reset for next step
                self.velocity = np.zeros(3)
                self.position = np.zeros(3)
                self.ground_z = 0.0
                self.heel_strike_time_ms = heel_strike_time_ms
                self.stride_start_time_ms = heel_strike_time_ms
            else:
                # Stable stance sample outside a just-completed step
                self.velocity = np.zeros(3)
            
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
                self.swing_dt_history.append(dt)
                
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
            'total_steps': self.total_steps,
            'last_reject_reason': self.last_reject_reason,
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
        self.reset_bout_state()
        
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
        self.reset_bout_state()
        self.last_stride_length = 0.0
        self.last_clearance = 0.0
        self.last_speed = 0.0
        self.total_steps = 0
        self.recent_valid_strides.clear()
        self.last_reject_reason = None
        self.standing_pitch = 0.0
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
        self.all_strides = deque(maxlen=100)
        self.all_clearances = deque(maxlen=100)
        self.all_speeds = deque(maxlen=100)
        self.all_stride_durations = deque(maxlen=100)
        self.step_intervals = deque(maxlen=100)
        self.last_step_time_ms = None
        self.last_step_side = None
        self.left_total_steps = 0
        self.right_total_steps = 0
    
    def _append_if_valid(self, history, value):
        if value is None:
            return
        if isinstance(value, (float, int, np.floating, np.integer)):
            history.append(float(value))

    def _mean(self, history):
        if not history:
            return None
        return float(np.mean(history))

    def register_step(self, side, gait_metrics):
        """
        Register a completed step from one foot and update aggregate metrics.
        
        Args:
            side: 'L' or 'R'
            gait_metrics: Per-step metrics from ZUPTGaitEstimator

        Returns:
            dict: Updated session-level aggregate metrics
        """
        stride_length = gait_metrics.get('stride_length_m')
        clearance = gait_metrics.get('clearance_m')
        speed_mps = gait_metrics.get('speed_mps')
        stride_duration_s = gait_metrics.get('stride_duration_s')
        heel_strike_time_ms = gait_metrics.get('heel_strike_time_ms')

        if side == 'L':
            self.left_total_steps += 1
            self._append_if_valid(self.left_strides, stride_length)
            self._append_if_valid(self.left_clearances, clearance)
        else:
            self.right_total_steps += 1
            self._append_if_valid(self.right_strides, stride_length)
            self._append_if_valid(self.right_clearances, clearance)

        self._append_if_valid(self.all_strides, stride_length)
        self._append_if_valid(self.all_clearances, clearance)
        self._append_if_valid(self.all_speeds, speed_mps)
        self._append_if_valid(self.all_stride_durations, stride_duration_s)

        latest_step_duration_s = None
        if heel_strike_time_ms is not None:
            if self.last_step_time_ms is not None and heel_strike_time_ms > self.last_step_time_ms:
                step_interval_s = (heel_strike_time_ms - self.last_step_time_ms) / 1000.0
                # Only treat alternating-foot events as global step intervals.
                if self.last_step_side != side:
                    self.step_intervals.append(step_interval_s)
                    latest_step_duration_s = step_interval_s

            self.last_step_time_ms = heel_strike_time_ms
            self.last_step_side = side

        metrics = self.get_session_metrics()
        metrics['latest_step_duration_s'] = latest_step_duration_s
        return metrics

    def add_step(self, side, stride_length, clearance):
        """Backward-compatible wrapper for older call sites."""
        return self.register_step(side, {
            'stride_length_m': stride_length,
            'clearance_m': clearance,
        })
    
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
        return float(symmetry)

    def get_session_metrics(self):
        """Return aggregate metrics across both feet for the current session."""
        total_steps = self.left_total_steps + self.right_total_steps
        avg_stride_duration_s = self._mean(self.all_stride_durations)
        avg_step_duration_s = self._mean(self.step_intervals)

        # If only one foot has completed strides so far, approximate cadence from stride duration.
        if avg_step_duration_s is None and avg_stride_duration_s:
            avg_step_duration_s = avg_stride_duration_s / 2.0

        cadence_spm = 60.0 / avg_step_duration_s if avg_step_duration_s else None

        return {
            'total_steps': total_steps,
            'left_steps': self.left_total_steps,
            'right_steps': self.right_total_steps,
            'cadence_spm': cadence_spm,
            'avg_step_duration_s': avg_step_duration_s,
            'avg_stride_duration_s': avg_stride_duration_s,
            'avg_stride_length_m': self._mean(self.all_strides),
            'avg_clearance_m': self._mean(self.all_clearances),
            'avg_speed_mps': self._mean(self.all_speeds),
            'symmetry_percent': self.get_symmetry(),
        }
    
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
        self.all_strides.clear()
        self.all_clearances.clear()
        self.all_speeds.clear()
        self.all_stride_durations.clear()
        self.step_intervals.clear()
        self.last_step_time_ms = None
        self.last_step_side = None
        self.left_total_steps = 0
        self.right_total_steps = 0


# Convenience alias
GaitEstimator = ZUPTGaitEstimator
