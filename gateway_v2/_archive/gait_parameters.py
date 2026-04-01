import numpy as np
from collections import deque

class GaitParameterCalculator:
    def __init__(self, buffer_size=5):
        self.reset_step()
        
        # History buffers for Averaging (Smooth data)
        self.buffer_size = buffer_size
        self.step_durations = deque(maxlen=buffer_size)
        
        # Tracking Variables
        self.last_stance_pos = np.zeros(3)
        self.is_moving = False # True = Swing, False = Stance
        self.last_heel_strike_pos = None # Track previous heel strike pos (Same Foot Stride)
        
        # [NEW] EKF Drift Detection
        self.min_foot_clearance = 999.0  # Track minimum clearance (for drift detection)
        self.drift_warning_count = 0  # Count consecutive drift warnings
        
        # Cycle Timing
        self.cycle_start_time = 0 # Time when Toe Off happened (Start of Swing)
        self.stance_start_time = 0 # Time when Heel Strike happened (Start of Stance)
        
        # Kinematic Tracking (Per Step)
        self.max_knee_flexion = 0.0
        self.min_knee_extension = 0.0
        self.max_hip_flexion = -999.0
        self.min_hip_extension = 999.0
        
        # Trajectory Tracking (For Circumduction)
        self.swing_trajectory = [] # List of [x, y] points during swing
        
        # [NEW] Knee Curve Collection
        self.knee_angle_history = []
        
        # Global Counters
        self.total_steps = 0
        self.cumulative_time = 0
        self.last_stance_duration = 0.0 # Duration of the previous stance phase

    def reset_step(self):
        self.current_swing_start_pos = None
        self.current_swing_start_time = 0
        self.max_foot_clearance = 0.0
        # [NEW] Reset drift detection trackers
        self.min_foot_clearance = 999.0
        self.drift_warning_count = 0
        
        # Kinematics Reset
        self.current_max_knee = -999.0
        self.current_min_knee = 999.0
        self.current_max_hip = -999.0 # Abduction
        self.current_max_trunk = -999.0
        self.current_max_hip_flex = -999.0
        self.current_min_hip_ext = 999.0
        
        self.swing_trajectory = []
        
        # [NEW] Reset Knee History
        self.knee_angle_history = []
        
        # self.last_stance_duration is NOT reset here, as it carries over cycles
    
    def reset_all(self):
        """
        Reset all counters and state. Call this when starting a new session.
        """
        self.reset_step()
        self.total_steps = 0
        self.cumulative_time = 0
        self.last_stance_duration = 0.0
        self.last_stance_pos = np.zeros(3)
        self.is_moving = False
        self.last_heel_strike_pos = None
        self.cycle_start_time = 0
        self.stance_start_time = 0
        self.step_durations.clear()
        print("🔄 Gait Calculator Reset - All counters cleared")

    def resample_data(self, data, target_len=100):
        """
        Resample data to a fixed length (for DTW/Template).
        Includes outlier filtering and quality checks.
        """
        if not data or len(data) < 2:
            return [0.0] * target_len
        
        # Convert to numpy array for easier processing
        data_arr = np.array(data)
        
        # [FIX] Outlier Filtering: Use Physiological Limits instead of 3-Sigma
        # Reason: 3-Sigma may filter out pathological gait patterns
        # Physiological limits for knee flexion during walking: -20 to 140 degrees
        # Negative values can occur due to measurement error or hyperextension
        PHYSIOLOGICAL_MIN = -20.0  # Allow slight hyperextension
        PHYSIOLOGICAL_MAX = 140.0  # Maximum knee flexion
        
        # Filter only values outside physiological limits
        mask = (data_arr >= PHYSIOLOGICAL_MIN) & (data_arr <= PHYSIOLOGICAL_MAX)
        filtered_data = data_arr[mask]
        
        # If too many points filtered, use original but clip to limits
        if len(filtered_data) < len(data_arr) * 0.7:  # More than 30% filtered
            print(f"⚠️ [CURVE] Many values outside physiological range, clipping instead")
            filtered_data = np.clip(data_arr, PHYSIOLOGICAL_MIN, PHYSIOLOGICAL_MAX)
        elif len(filtered_data) == 0:
            # All filtered - use original with clipping
            filtered_data = np.clip(data_arr, PHYSIOLOGICAL_MIN, PHYSIOLOGICAL_MAX)
        
        # [FIX] Quality Check: Ensure we have enough data points
        if len(filtered_data) < 3:
            print(f"⚠️ [CURVE] Insufficient data points ({len(filtered_data)}), returning zeros")
            return [0.0] * target_len
        
        # [FIX] Smooth the data before resampling (Savgol Filter or Light Moving Average)
        # Use Savgol filter for better preservation of signal shape
        if len(filtered_data) > 7:
            try:
                from scipy.signal import savgol_filter
                window_length = min(7, len(filtered_data) // 3)
                if window_length % 2 == 0:
                    window_length += 1  # Must be odd
                if window_length >= 5:
                    filtered_data = savgol_filter(filtered_data, window_length, 3)  # 3rd order polynomial
            except ImportError:
                # Fallback to light moving average if scipy not available
                from scipy.ndimage import uniform_filter1d
                window_size = min(5, len(filtered_data) // 4)
                if window_size >= 3:
                    filtered_data = uniform_filter1d(filtered_data, size=window_size, mode='nearest')
        elif len(filtered_data) > 5:
            # Light moving average for shorter sequences
            from scipy.ndimage import uniform_filter1d
            window_size = min(3, len(filtered_data) // 3)
            if window_size >= 3:
                filtered_data = uniform_filter1d(filtered_data, size=window_size, mode='nearest')
        
        # Resample to target length
        x_old = np.linspace(0, 100, len(filtered_data))
        x_new = np.linspace(0, 100, target_len)
        resampled = np.interp(x_new, x_old, filtered_data)
        
        # Final validation: Check if resampled data is reasonable
        if np.any(np.isnan(resampled)) or np.any(np.isinf(resampled)):
            print(f"⚠️ [CURVE] NaN/Inf detected in resampled data, returning zeros")
            return [0.0] * target_len
        
        # Clip to physiological limits (allow slight negative for hyperextension)
        resampled = np.clip(resampled, -20, 140)
        
        return resampled.tolist()

    def update(self, gait_event, current_pos, current_vel, timestamp_ms, 
               current_knee_angle=None, current_hip_angle=None, current_trunk_angle=None, current_hip_flexion=None):
        """
        REQ-007, REQ-008, REQ-009 Implementation
        
        Args:
            gait_event: dict from HybridGaitDetector containing:
                - phase: "STANCE" or "SWING"
                - event: "HEEL_STRIKE", "TOE_OFF", or None
                - pitch_deg: current shank pitch angle
                - is_valid_step: True if step passed validation
            current_knee_angle: (Optional) degrees
            current_hip_angle: (Optional) degrees
            current_trunk_angle: (Optional) degrees
            current_hip_flexion: (Optional) degrees
        """
        result = None
        
        # Extract event info
        phase = gait_event.get("phase", "STANCE")
        event = gait_event.get("event", None)
        pitch_deg = gait_event.get("pitch_deg", 0.0)
        is_valid_step = gait_event.get("is_valid_step", False)
        
        # Convert phase to is_stance for compatibility
        is_stance = (phase == "STANCE")
        
        # --- Kinematic Tracking (Any Phase) ---
        if current_knee_angle is not None:
            self.current_max_knee = max(self.current_max_knee, current_knee_angle)
            self.current_min_knee = min(self.current_min_knee, current_knee_angle)
            
            # [NEW] Collect Knee History
            self.knee_angle_history.append(current_knee_angle)
            
        if current_hip_angle is not None:
             self.current_max_hip = max(self.current_max_hip, current_hip_angle)
             
        if current_trunk_angle is not None:
             self.current_max_trunk = max(self.current_max_trunk, abs(current_trunk_angle)) # Peak Sway (abs)

        if current_hip_flexion is not None:
             self.current_max_hip_flex = max(self.current_max_hip_flex, current_hip_flexion)
             self.current_min_hip_ext = min(self.current_min_hip_ext, current_hip_flexion)

        # ========================================
        # EVENT-DRIVEN LOGIC (NEW)
        # ========================================
        # Instead of waiting for phase transitions, we respond to events directly
        
        # --- TOE OFF EVENT (Start of Swing) ---
        if event == "TOE_OFF":
            self.is_moving = True
            
            # Record Start Position & Time
            self.current_swing_start_pos = self.last_stance_pos.copy()
            self.current_swing_start_time = timestamp_ms
            
            # Reset trajectory for this new step
            self.swing_trajectory = []
            
            # Reset Step-specific trackers
            self.max_foot_clearance = 0.0
            self.current_max_knee = -999.0
            self.current_min_knee = 999.0
            self.current_max_hip = -999.0
            self.current_max_trunk = -999.0
            
            # Capture Stance Duration
            if self.stance_start_time > 0:
                self.last_stance_duration = (timestamp_ms - self.stance_start_time) / 1000.0
            
            print(f"👟 [GAIT] Toe Off - Starting Swing Phase")
        
        # --- DURING SWING: Track Clearance & Trajectory ---
        if self.is_moving and self.current_swing_start_pos is not None:
            rel_z = current_pos[2] - self.current_swing_start_pos[2]
            if rel_z > self.max_foot_clearance:
                self.max_foot_clearance = rel_z
            
            # Track minimum clearance for EKF drift detection
            if rel_z < self.min_foot_clearance:
                self.min_foot_clearance = rel_z
                if rel_z < -0.10:  # -10cm
                    self.drift_warning_count += 1
                    if self.drift_warning_count == 1:
                        print(f"⚠️ [EKF DRIFT] Foot clearance below -10cm ({rel_z*100:.1f}cm)")
                else:
                    self.drift_warning_count = 0
            
            # Track Trajectory for Circumduction (X, Y)
            self.swing_trajectory.append(current_pos[0:2])
        
        # --- HEEL STRIKE / STATIC LANDING EVENT (End of Swing / Start of Stance) ---
        # [NEW v3.0] Handle both normal and forced landing events
        if event in ["HEEL_STRIKE", "STATIC_LANDING"] and self.is_moving:
            self.is_moving = False
            self.stance_start_time = timestamp_ms
            
            # 1. Spatial Calc (Corrected)
            # Stride Length: Distance from previous Heel Strike to current Heel Strike (Same foot)
            stride_length = 0.0
            if self.last_heel_strike_pos is not None:
                stride_vector = current_pos - self.last_heel_strike_pos
                stride_length = np.linalg.norm(stride_vector[0:2])
            
            # Step Length: Displacement during Swing (Toe Off -> Heel Strike)
            if self.current_swing_start_pos is None:
                print(f"⚠️ [GAIT] Heel Strike detected but no swing start position! Skipping step.")
                self.last_stance_pos = current_pos.copy()
                return None
            
            step_vector = current_pos - self.current_swing_start_pos
            step_length = np.linalg.norm(step_vector[0:2])
            
            # 2. Temporal Calc
            swing_duration = (timestamp_ms - self.current_swing_start_time) / 1000.0
            
            # [FILTER] Outlier Rejection
            MIN_SWING_TIME = 0.2
            MIN_STEP_LENGTH = 0.10
            MAX_STEP_LENGTH = 1.3

            if swing_duration < MIN_SWING_TIME or \
               step_length < MIN_STEP_LENGTH or \
               step_length > MAX_STEP_LENGTH:
                # Filter out (noise or drift)
                self.last_stance_pos = current_pos.copy()
                return None

            self.step_durations.append(swing_duration)
            
            # Update Trackers (Only if passed filter)
            self.last_heel_strike_pos = current_pos.copy()
            
            # Normalize Curve with Quality Check
            if len(self.knee_angle_history) < 5:
                print(f"⚠️ [GAIT] Knee angle history too short ({len(self.knee_angle_history)} points), skipping curve")
                normalized_curve = [0.0] * 100
            else:
                curve_array = np.array(self.knee_angle_history)
                curve_range = np.max(curve_array) - np.min(curve_array)
                
                if curve_range < 5.0:
                    print(f"⚠️ [GAIT] Curve range too small ({curve_range:.1f}°), likely noise")
                    normalized_curve = [0.0] * 100
                else:
                    normalized_curve = self.resample_data(self.knee_angle_history, 100)
                    
                    curve_max = np.max(normalized_curve)
                    curve_min = np.min(normalized_curve)
                    if curve_max > 90 or curve_min < 0:
                        print(f"⚠️ [GAIT] Curve out of bounds (min={curve_min:.1f}°, max={curve_max:.1f}°), using zeros")
                        normalized_curve = [0.0] * 100
            
            # 3. Kinematic Snapshot
            peak_knee = self.current_max_knee if self.current_max_knee != -999 else 0
            extension_knee = self.current_min_knee if self.current_min_knee != 999 else 0
            peak_hip_abd = self.current_max_hip if self.current_max_hip != -999 else 0
            peak_trunk = self.current_max_trunk if self.current_max_trunk != -999 else 0
            
            peak_hip_flex = self.current_max_hip_flex if self.current_max_hip_flex != -999 else 0
            peak_hip_ext = self.current_min_hip_ext if self.current_min_hip_ext != 999 else 0

            # 3.1 Calculate Circumduction
            circumduction_cm = 0.0
            if len(self.swing_trajectory) > 2:
                p1 = self.current_swing_start_pos[0:2]
                p2 = current_pos[0:2]
                
                max_dev = 0.0
                for p in self.swing_trajectory:
                    num = abs((p2[1] - p1[1])*p[0] - (p2[0] - p1[0])*p[1] + p2[0]*p1[1] - p2[1]*p1[0])
                    den = np.linalg.norm(p2 - p1)
                    if den > 0.01:
                        d = num / den
                        if d > max_dev:
                            max_dev = d
                circumduction_cm = max_dev * 100.0
            
            # 4. Derived Metrics with Smart Pause Detection
            cadence = 0
            speed_mps = 0
            swing_pct = 40.0
            stance_pct = 60.0
            
            # Calculate cycle time
            cycle_time = swing_duration + self.last_stance_duration
            
            # [NEW] Smart Calculation: Detect if user paused too long (>1.5s stance)
            PAUSE_THRESHOLD = 1.5  # seconds
            
            if self.last_stance_duration > PAUSE_THRESHOLD:
                # 🛑 Long pause detected: Estimate cycle from swing duration
                # Assume swing is ~40% of normal gait cycle
                estimated_cycle_time = swing_duration / 0.40 if swing_duration > 0 else 1.0
                
                # Calculate using estimated cycle (ignores pause time)
                speed_mps = step_length / estimated_cycle_time
                cadence = 60.0 / estimated_cycle_time
                
                # Use typical phase percentages
                swing_pct = 40.0
                stance_pct = 60.0
                
                print(f"⏸️ [PAUSE DETECTED] Stance: {self.last_stance_duration:.1f}s > {PAUSE_THRESHOLD}s | Using estimated cycle: {estimated_cycle_time:.2f}s")
                
            elif cycle_time > 0:
                # 🏃 Normal walking: Use actual cycle time
                speed_mps = step_length / cycle_time
                cadence = 60.0 / cycle_time
                swing_pct = (swing_duration / cycle_time) * 100.0
                stance_pct = (self.last_stance_duration / cycle_time) * 100.0
                
            elif swing_duration > 0:
                # Fallback: No stance data yet
                estimated_cycle_time = swing_duration / 0.40
                cadence = 60.0 / estimated_cycle_time
                speed_mps = step_length / estimated_cycle_time
            
            # Save stance pos
            self.last_stance_pos = current_pos.copy()
            
            # Increment Step Counter
            self.total_steps += 1
            
            result = {
                "spatial": {
                    "step_length_m": step_length,
                    "stride_length_m": stride_length,
                    "clearance_m": self.max_foot_clearance
                },
                "temporal": {
                    "swing_duration_s": swing_duration,
                    "stance_duration_s": self.last_stance_duration,
                    "cadence_spm": cadence,
                    "speed_mps": speed_mps,
                    "swing_phase_percent": swing_pct,
                    "stance_phase_percent": stance_pct,
                    "step_count": self.total_steps
                },
                "kinematic": {
                    "peak_knee_flexion": peak_knee,
                    "knee_extension_stance": extension_knee,
                    "peak_hip_abduction": peak_hip_abd,
                    "peak_trunk_sway": peak_trunk,
                    "peak_hip_flexion": peak_hip_flex,
                    "peak_hip_extension": peak_hip_ext,
                    "circumduction_cm": circumduction_cm
                },
                "raw_curve": normalized_curve
            }
            
            # Reset History AFTER processing
            self.knee_angle_history = []
            if current_knee_angle is not None:
                self.knee_angle_history.append(current_knee_angle)
        
        # During Stance (continuous) - update last stance position
        elif phase == "STANCE" and not self.is_moving:
            self.last_stance_pos = current_pos.copy()
                
        return result
