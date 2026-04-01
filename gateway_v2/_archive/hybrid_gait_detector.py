"""
Fused Hybrid Gait Detector v3.2 (Robust Multi-Sensor)
=====================================================
Fixes: Stance/Swing flickering when using 2 sensors.
Method: Uses REAL timestamp deltas for slope calculation instead of fixed sampling rate.
"""

import numpy as np
from collections import deque


class FusedHybridGaitDetector:
    """
    Gait phase detector using Roll angle trajectory with SHOE validation.
    
    v3.2 Changes:
    - Uses real timestamp deltas for slope calculation (fixes multi-sensor lag issues)
    - Robust to variable sample rates and network jitter
    """
    
    def __init__(self, sample_rate=100.0):
        self.sample_rate = sample_rate
        # self.dt is no longer used - we use real timestamps
        
        # ==== Adaptive Thresholds ====
        self.last_step_amplitude = 30.0
        self.threshold_ratio = 0.3  # 30% of amplitude (reduced from 50%)
        
        # Limits (with max caps to prevent over-restrictive thresholds)
        self.min_peak_threshold = 10.0
        self.max_peak_threshold = 25.0   # [NEW] Cap to prevent too high
        self.min_trough_threshold = -10.0
        self.max_trough_threshold = -25.0  # [NEW] Cap to prevent too low
        
        self.adaptive_peak_threshold = 15.0
        self.adaptive_trough_threshold = -10.0  # Relaxed from -15
        
        # ==== Buffers (Added Time Buffer) ====
        self.angle_window_size = 5
        self.slope_window_size = 5 
        
        self.angle_buffer = deque(maxlen=self.angle_window_size)
        self.last_angles = deque(maxlen=self.slope_window_size)
        
        # [NEW] Buffer for real timestamps (fixes multi-sensor lag)
        self.last_timestamps = deque(maxlen=self.slope_window_size) 
        self.last_slope_sign = 0
        
        # ==== Timers & State ====
        self.swing_lock_duration_ms = 350
        self.swing_start_time = 0
        self.static_landing_duration_ms = 150
        self.static_start_time = 0
        self.is_static_continuous = False
        
        self.current_phase = "STANCE"
        self.smoothed_angle = 0.0
        self.max_angle_in_cycle = -999.0
        self.min_angle_in_cycle = 999.0
        
        self.min_event_interval_ms = 400
        self.last_hs_time = 0
        self.last_to_time = 0
        
        self.angle_offset = 0.0
        self.step_count = 0

    def set_zero(self):
        """Set current angle as zero reference (Auto-Zero/Tare)"""
        if len(self.angle_buffer) > 0:
            self.angle_offset = np.mean(self.angle_buffer)
            print(f"🎯 [ZERO SET] Offset: {self.angle_offset:.1f}°")
        else:
            print("⚠️ [ZERO] No data in buffer, cannot set zero")

    def calculate_roll_from_quaternion(self, quat):
        """Extract Roll angle from quaternion (rotation around X axis)"""
        w, x, y, z = quat
        sinr_cosp = 2.0 * (w * x + y * z)
        cosr_cosp = 1.0 - 2.0 * (x * x + y * y)
        return np.degrees(np.arctan2(sinr_cosp, cosr_cosp))
    
    def calculate_slope_realtime(self):
        """
        [NEW v3.2] Calculate slope using real timestamps.
        
        This fixes the flickering issue when using 2 sensors by properly
        accounting for variable sample intervals due to network lag.
        
        Returns:
            tuple: (slope in deg/s, sign: -1/0/+1)
        """
        if len(self.last_angles) < 2 or len(self.last_timestamps) < 2: 
            return 0.0, 0
            
        # Delta Angle
        d_angle = self.last_angles[-1] - self.last_angles[0]
        
        # Delta Time in seconds (from real timestamps)
        t_new = self.last_timestamps[-1]
        t_old = self.last_timestamps[0]
        d_time = (t_new - t_old) / 1000.0
        
        if d_time <= 0.001:
            return 0.0, 0  # Prevent division by zero
        
        slope = d_angle / d_time  # deg/s
        
        # Deadband of 15 deg/s to filter noise (reduced from 30)
        deadband = 15.0
        if slope > deadband:
            return slope, 1
        elif slope < -deadband:
            return slope, -1
        else:
            return slope, 0

    def update_adaptive_thresholds(self):
        """Update thresholds based on last step amplitude with caps"""
        amplitude = self.max_angle_in_cycle - self.min_angle_in_cycle
        if amplitude > 10.0:
            calc_threshold = amplitude * self.threshold_ratio
            
            # Apply min AND max bounds
            self.adaptive_peak_threshold = min(max(calc_threshold, self.min_peak_threshold), self.max_peak_threshold)
            self.adaptive_trough_threshold = max(min(-calc_threshold, self.min_trough_threshold), self.max_trough_threshold)
            
            print(f"📏 [ADAPTIVE] Amp: {amplitude:.1f}° → Peak: {self.adaptive_peak_threshold:.1f}°, Trough: {self.adaptive_trough_threshold:.1f}°")

    def update(self, quat, timestamp_ms, is_static):
        """
        Main update function with SHOE validation.
        
        Args:
            quat: [w, x, y, z] quaternion from EKF
            timestamp_ms: Current timestamp in milliseconds  
            is_static: Boolean from SHOE detector (True = sensor is still)
            
        Returns:
            dict with angle_deg, event, phase, is_locked, is_static
        """
        # 1. Angle Calculation
        raw_angle = self.calculate_roll_from_quaternion(quat)
        adjusted_angle = raw_angle - self.angle_offset
        
        self.angle_buffer.append(adjusted_angle)
        self.smoothed_angle = np.mean(self.angle_buffer) if len(self.angle_buffer) == self.angle_window_size else adjusted_angle
        
        # [NEW] Store both Angle AND Timestamp for real-time slope
        self.last_angles.append(self.smoothed_angle)
        self.last_timestamps.append(timestamp_ms)
        
        self.max_angle_in_cycle = max(self.max_angle_in_cycle, self.smoothed_angle)
        self.min_angle_in_cycle = min(self.min_angle_in_cycle, self.smoothed_angle)
        
        # 2. Calculate Slope using Real Time
        slope, slope_sign = self.calculate_slope_realtime()
        
        # [DEBUG] Log every 50 samples
        if timestamp_ms % 500 < 20:
            print(f"📐 [DBG] Angle: {self.smoothed_angle:.1f}° | Slope: {slope:.0f}°/s ({slope_sign}) | Static: {is_static} | Phase: {self.current_phase}")
        
        # 3. Track Static Duration
        if is_static:
            if not self.is_static_continuous:
                self.static_start_time = timestamp_ms
                self.is_static_continuous = True
            static_dur = timestamp_ms - self.static_start_time
        else:
            self.is_static_continuous = False
            static_dur = 0
            
        event = None
        is_locked = False
        
        # === STATE MACHINE ===
        if self.current_phase == "STANCE":
            time_since_last_to = timestamp_ms - self.last_to_time
            
            # Toe-Off Detection: Rising slope + below trough + moving
            if (slope_sign == 1 and 
                self.smoothed_angle < self.adaptive_trough_threshold and 
                not is_static and 
                time_since_last_to > self.min_event_interval_ms):
                
                event = "TOE_OFF"
                self.current_phase = "SWING"
                self.swing_start_time = timestamp_ms
                self.last_to_time = timestamp_ms
                print(f"👟 [TO] Valley: {self.min_angle_in_cycle:.1f}°")
                
        elif self.current_phase == "SWING":
            time_in_swing = timestamp_ms - self.swing_start_time
            is_locked = (time_in_swing < self.swing_lock_duration_ms)
            
            if not is_locked:
                time_since_last_hs = timestamp_ms - self.last_hs_time
                
                # Normal Heel Strike: Slope changes from + to - at peak
                if (self.last_slope_sign == 1 and slope_sign == -1 and 
                    self.max_angle_in_cycle > self.adaptive_peak_threshold and
                    time_since_last_hs > self.min_event_interval_ms):
                    
                    event = "HEEL_STRIKE"
                    self.current_phase = "STANCE"
                    self._handle_step_end(timestamp_ms)
                    print(f"🦶 [HS] Peak: {self.max_angle_in_cycle:.1f}°")
                
                # Forced Landing: SHOE says static for too long
                elif is_static and static_dur > self.static_landing_duration_ms:
                    event = "STATIC_LANDING"
                    self.current_phase = "STANCE"
                    self._handle_step_end(timestamp_ms)
                    print(f"⚡ [FORCE HS] Static: {static_dur}ms")

        # Update last slope sign
        if slope_sign != 0:
            self.last_slope_sign = slope_sign
        
        return {
            "angle_deg": self.smoothed_angle,
            "event": event,
            "phase": self.current_phase,
            "is_locked": is_locked,
            "is_static": is_static
        }

    def _handle_step_end(self, timestamp_ms):
        """Common logic for step completion (HS or Forced Landing)"""
        self.last_hs_time = timestamp_ms
        self.step_count += 1
        self.update_adaptive_thresholds()
        self.max_angle_in_cycle = self.smoothed_angle
        self.min_angle_in_cycle = self.smoothed_angle


# Alias for backward compatibility
HybridGaitDetector = FusedHybridGaitDetector
