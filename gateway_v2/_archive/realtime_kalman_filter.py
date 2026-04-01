import numpy as np
from scipy.spatial.transform import Rotation as R

class RealtimeEKF:
    def __init__(self, sample_rate=100.0):
        """
        Error-State Extended Kalman Filter for IMU-based Trajectory Tracking.
        Ref: Sola, "Quaternion kinematics for the error-state Kalman filter"
        """
        self.dt = 1.0 / sample_rate
        
        # --- State Vector (Nominal) ---
        # p (3) + v (3) + q (4) = 10 elements
        # Position (meters), Velocity (m/s), Quaternion (w,x,y,z)
        self.p = np.zeros(3)
        self.v = np.zeros(3)
        self.q = np.array([1.0, 0.0, 0.0, 0.0]) # Identity quaternion
        
        # --- Error State Covariance (P) ---
        # delta_p (3) + delta_v (3) + delta_theta (3) = 9 elements
        self.P = np.eye(9) * 0.01
        
        # --- Noise Matrices ---
        # Tuning these is critical!
        # Process Noise (Q)
        self.var_acc = 0.1   # Accelerometer Noise
        self.var_gyro = 0.05 # Gyroscope Noise
        self.var_acc_bias = 0.001
        self.var_gyro_bias = 0.001
        
        self.Q = np.eye(6)
        self.Q[0:3, 0:3] *= self.var_acc**2
        self.Q[3:6, 3:6] *= self.var_gyro**2
        
        # Measurement Noise (R) for ZUPT
        # When stationary, velocity *should* be zero.
        self.R_zupt = np.eye(3) * 0.01 # High confidence in zero velocity
        
        # Gravity Vector (assumed down Z in world frame)
        self.g = np.array([0, 0, 9.81])

    def predict(self, acc, gyro, dt=None):
        """
        Predict Step: Integrate IMU data.
        acc: [ax, ay, az] in m/s^2 (Body Frame)
        gyro: [gx, gy, gz] in rad/s (Body Frame)
        dt: Time delta in seconds. If None, use default self.dt
        """
        # 1. Input Validation (Medical Grade)
        if np.any(np.isnan(acc)) or np.any(np.isinf(acc)) or np.any(np.isnan(gyro)) or np.any(np.isinf(gyro)):
             print("❌ SENSOR FAILURE: Invalid IMU data (NaN/Inf)")
             return # Skip update to protect state

        step_dt = dt if dt is not None else self.dt
        
        # Nominal State Integration
        # Capture Rotation at step k (before update)
        current_r = R.from_quat([self.q[1], self.q[2], self.q[3], self.q[0]]) # Scipy uses [x,y,z,w]
        rot_mat = current_r.as_matrix() # Used for F matrix
        
        # Safety: Clamp DT to prevent integration explosion during latency spikes
        step_dt = min(dt, 0.05) # Max 50ms per step
        
        acc_world = current_r.apply(acc) - self.g
        
        # p_new = p + v*dt + 0.5*a*dt^2
        self.p = self.p + self.v * step_dt + 0.5 * acc_world * step_dt**2
        
        # v_new = v + a*dt
        self.v = self.v + acc_world * step_dt
        
        # Safety: Reset if Velocity Explodes (>15 m/s)
        if np.linalg.norm(self.v) > 15.0:
            print(f"⚠️ EKF EXPLOSION DETECTED (V={np.linalg.norm(self.v):.1f}m/s). Resetting State.")
            self.reset_state()
            return
        
        # q_new via quaternion integrator
        # Angle of rotation = ||gyro|| * dt
        angle = np.linalg.norm(gyro) * step_dt
        if angle > 1e-6:
            axis = gyro / np.linalg.norm(gyro)
            delta_q = R.from_rotvec(axis * angle)
            # Update orientation: q_new = q_old * delta_q
            # current_r is Q_k. 
            # q_new = Q_k * delta_q
            new_r = current_r * delta_q
            self.q = new_r.as_quat()[[3, 0, 1, 2]] # Convert back to [w,x,y,z]
            
        # 2. Quaternion Integrity Check
        norm_q = np.linalg.norm(self.q)
        if abs(norm_q - 1.0) > 0.05:
            print(f"⚠️ EKF WARNING: Quaternion denormalized (norm={norm_q:.4f}). Renormalizing.")
            self.q /= norm_q
            
        # --- Error Covariance Prediction (P = F*P*F.T + Q) ---
        # F matrix (Error State Transition) 9x9
        # Rows: delta_p, delta_v, delta_theta
        F = np.eye(9)
        
        # Position error: dp = dp + dv*dt
        F[0:3, 3:6] = np.eye(3) * step_dt
        
        # Velocity error: dv = dv - R * skew(acc_body) * dtheta * dt
        # Ref: Sola (268)
        # skew symmetric matrix of acceleration in body frame
        def skew(v):
            return np.array([
                [0, -v[2], v[1]],
                [v[2], 0, -v[0]],
                [-v[1], v[0], 0]
            ])
            
        # Rotate acceleration covariance term
        # The equation relies on the fact that orientation error affects gravity removal... 
        # Actually in ES-EKF typical form: dv_err = ... - R * skew(a) * dtheta
        
        # Current rotation R (captured at start)
        # rot_mat = current_r.as_matrix() # Already computed
        
        # Effect of orientation error on velocity (cross product term)
        # This term couples theta error to velocity error
        F[3:6, 6:9] = -rot_mat @ skew(acc) * step_dt
        
        # Propagate P
        # Q_discrete approx = Q * dt
        # Note: self.Q is 6x6 (acc, gyro). We need to map it to 9x9.
        # W matrix maps noise to state derivatives: W = [0 0; -R -I; 0 -I] approx
        # Simplified: Add noise directly to Velocity and Orientation blocks
        
        # 1. Prediction
        self.P = F @ self.P @ F.T
        
        # 2. Add Process Noise
        # Accel noise goes to Velocity block (rotated?)
        # For simplicity, add to diagonal blocks (assuming body frame noise alignment)
        # Actually better to rotate the noise: Q_v_world = R * Q_acc * R.T * dt^2
        
        Q_v = (rot_mat @ self.Q[0:3, 0:3] @ rot_mat.T) * (step_dt**2)
        Q_theta = self.Q[3:6, 3:6] * (step_dt**2) # Gyro noise integration
        
        self.P[3:6, 3:6] += Q_v
        self.P[6:9, 6:9] += Q_theta
        
        # Stability: Force Symmetry and Clamp Negative Diagonal
        self.P = (self.P + self.P.T) / 2.0
        # Prevent explosion
        if np.any(np.diag(self.P) > 1000.0):
             # print("⚠️ Kalman Covariance Explosion Detected. Reseting P.")
             self.P = np.eye(9) * 0.01

        # Nan Check
        if np.isnan(self.P).any():
             print("❌ EKF NaN Detected in Predict. Resetting.")
             self.reset_state()


    def update_zupt(self):
        """
        Measurement Update: Zero Velocity Update.
        Call this when Stance is detected.
        """
        # Observation: Velocity should be [0, 0, 0]
        # Measurement residual = v_measured (0) - v_nominal
        # But in Error State: inputs are (0 - v_nominal).
        # We model: v_true = v_nominal + delta_v
        # Constraint: v_true = 0 => delta_v = -v_nominal
        
        # H matrix (Jacobian of observation w.r.t error state)
        # Error State Vector: [delta_p (3), delta_v (3), delta_theta (3)]
        # We observe Velocity directly.
        # H = [0_3x3, I_3x3, 0_3x3]
        H = np.zeros((3, 9))
        H[0:3, 3:6] = np.eye(3)
        
        # Kalman Gain: K = P * H.T * (H * P * H.T + R)^-1
        # R_zupt is 3x3
        S = H @ self.P @ H.T + self.R_zupt
        K = self.P @ H.T @ np.linalg.inv(S)
        
        # Measurement Residual (z)
        # We want v to be 0. Current v is self.v.
        # Residual y = 0 - self.v = -self.v
        result = -self.v
        
        # Compute Error State: delta_x = K * y
        delta_x = K @ result
        
        # --- Injection (Correct Nominal State) ---
        # 1. Position: p = p + delta_p
        self.p += delta_x[0:3]
        
        # 2. Velocity: v = v + delta_v
        self.v += delta_x[3:6]
        
        # 3. Orientation: q = q * Quat(delta_theta)
        # Small angle approximation for delta_theta
        angle_err = delta_x[6:9]
        if np.linalg.norm(angle_err) > 1e-12:
            delta_rot = R.from_rotvec(angle_err)
            # Apply correction. Note: Order matters.
            # Local error definition: q_true = q_nom * delta_q
            current_r = R.from_quat([self.q[1], self.q[2], self.q[3], self.q[0]]) # Scalar last to scalar first
            corrected_r = current_r * delta_rot
            self.q = corrected_r.as_quat()[[3, 0, 1, 2]] # Back to [w, x, y, z]
            
        # --- Update Covariance P (Joseph Form) ---
        # Formula: P = (I - KH) * P * (I - KH).T + K * R * K.T
        # This form guarantees P remains symmetric and positive definite.
        I = np.eye(9)
        I_KH = I - K @ H
        
        # Term 1: (I - KH) P (I - KH).T
        term1 = I_KH @ self.P @ I_KH.T
        
        # Term 2: K R K.T
        term2 = K @ self.R_zupt @ K.T
        
        self.P = term1 + term2
        
        # Stability Check
        if np.isnan(self.P).any():
             print("❌ EKF NaN Detected in Update. Resetting.")
             self.reset_state()
        
        # Reset Error State (Implied, since we injected it)
        # The ES-EKF assumes error state is zeroed after every injection.

    def get_orientation_quaternion(self):
        # Return [w, x, y, z]
        return self.q

    def initialize_orientation(self, acc):
        """
        Initialize orientation using static accelerometer reading (Gravity Vector).
        Assumption: Device is stationary. Gravity points DOWN (-Z or +Z depend on frame).
        We want to find rotation R that aligns device Z with world Vertical.
        Yaw is initialized to 0.
        """
        # Global Gravity: [0, 0, g]
        # Measured Acc (Body): R.T * [0;0;g]
        # We compute Pitch and Roll.
        
        ax, ay, az = acc
        
        # Normalize
        norm = np.linalg.norm(acc)
        if norm < 0.1: return # Invalid data
        ax /= norm
        ay /= norm
        az /= norm
        
        # Pitch (Rotation around Y)
        # pitch = arctan2(-ax, sqrt(ay^2 + az^2))
        pitch = np.arctan2(-ax, np.sqrt(ay**2 + az**2))
        
        # Roll (Rotation around X)
        # roll = arctan2(ay, az)
        roll = np.arctan2(ay, az)
        
        # Yaw (Heading) - unknown from gravity. Set to 0.
        yaw = 0.0
        
        # Create Rotation via Euler ZYX (Yaw, Pitch, Roll)
        r = R.from_euler('xyz', [roll, pitch, yaw])
        
        # Update State
        q_scipy = r.as_quat() # [x, y, z, w]
        self.q = np.array([q_scipy[3], q_scipy[0], q_scipy[1], q_scipy[2]])
        print(f"⚖️ Static Alignment: Pitch={np.degrees(pitch):.1f}°, Roll={np.degrees(roll):.1f}°")

    def reset_state(self):
        """
        Reset State Vector (p, v) and Covariance Matrix (P).
        Called after Calibration to ensure a fresh start.
        """
        self.p = np.zeros(3)
        self.v = np.zeros(3)
        # Note: self.q is NOT reset here, as it's set by initialize_orientation
        
        # Reset Covariance P to initial uncertainty
        # delta_p (3) + delta_v (3) + delta_theta (3) = 9 elements
        self.P = np.eye(9) * 0.01
        print("🔄 EKF State & Covariance Reset")

    def reset_position_xy(self):
        """
        Reset only X,Y position to zero after each step.
        
        Purpose: Prevent accumulated drift and float precision loss.
        - Called at Heel Strike AFTER step length calculation
        - Preserves Z (vertical) for foot clearance tracking
        - Preserves Velocity and Orientation (they reset via ZUPT)
        - Does NOT reset Covariance (maintains filter confidence)
        
        This ensures each step measurement starts from origin,
        making step_length = ||current_pos - [0,0,z]|| more reliable.
        """
        self.p[0] = 0.0  # Reset X (forward)
        self.p[1] = 0.0  # Reset Y (lateral)
        # Keep p[2] (Z) for clearance calculations
