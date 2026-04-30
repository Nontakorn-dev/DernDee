"""
DernDee v2.0 - CWT Walking Detector
====================================
Based on: CWT + Adaptive Threshold Algorithm

This module determines if the user is WALKING vs NOISE (sitting, leg shaking, etc.)
It does NOT calculate gait parameters - that's gait_estimator.py's job.

Architecture:
    1. Calculate Gyro Norm (orientation-independent)
    2. Apply CWT (gaus2, scale=15) for signal enhancement
    3. Adaptive Threshold (Percentile 10 of peaks)
    4. Bout Detection (group peaks <5s, reject <3 steps)
"""

import numpy as np
from collections import deque
from scipy import signal


class CWTWalkingDetector:
    """
    CWT-based Walking Detection - The Manager Layer
    
    Filters out noise (sitting, leg shaking) and only allows
    genuine walking bouts to pass through to the estimator.
    """
    
    def __init__(self, sample_rate=100.0):
        """
        Initialize CWT Walking Detector.
        
        Args:
            sample_rate: IMU sampling rate in Hz (must be >=100Hz for accuracy)
        """
        self.sample_rate = sample_rate
        self.dt = 1.0 / sample_rate
        
        # ==== CWT Parameters (from paper) ====
        self.wavelet = 'gaus2'  # Gaussian derivative wavelet
        self.cwt_scale = 15     # Scale for CWT
        
        # ==== Adaptive Threshold Parameters ====
        self.threshold_percentile = 10  # Use 10th percentile of peak heights
        self.min_peak_distance = int(0.3 * sample_rate)  # Min 0.3s between peaks (steps)
        
        # ==== Bout Detection Parameters ====
        self.max_gap_samples = int(5.0 * sample_rate)  # 5 seconds max gap
        self.max_gap_ms = int(self.max_gap_samples * 1000 / sample_rate)
        self.min_steps_per_bout = 3  # Minimum steps to be valid walking
        
        # ==== Buffers ====
        # Buffer size: 10 seconds of data for bout analysis
        self.buffer_size = int(10.0 * sample_rate)
        self.gyro_norm_buffer = deque(maxlen=self.buffer_size)
        self.cwt_buffer = deque(maxlen=self.buffer_size)
        self.timestamp_buffer = deque(maxlen=self.buffer_size)
        
        # ==== State ====
        self.is_currently_walking = False
        self.current_bout_peaks = []
        self.adaptive_threshold = 0.5  # Initial threshold (updated dynamically)
        self.last_peak_time = 0
        self.steps_in_current_bout = 0
        
        # ==== Step Events (for gait_estimator) ====
        self.step_start_time = None
        self.step_end_time = None
        
        # ==== Real-time Peak Detection ====
        self.recent_cwt_values = deque(maxlen=5)  # For local peak detection
        self.peak_heights_history = deque(maxlen=50)  # For adaptive threshold
        
    def calculate_norm(self, gx, gy, gz):
        """
        Calculate gyroscope magnitude (norm).
        This makes detection orientation-independent.
        
        Args:
            gx, gy, gz: Gyroscope values in rad/s
            
        Returns:
            float: Gyro norm in rad/s
        """
        return np.sqrt(gx**2 + gy**2 + gz**2)
    
    def apply_cwt_realtime(self, gyro_norm):
        """
        Apply CWT to a single sample in real-time.
        Uses a sliding window approach for efficiency.
        
        Args:
            gyro_norm: Current gyro norm value
            
        Returns:
            float: CWT coefficient at current time
        """
        # Add to buffer
        self.gyro_norm_buffer.append(gyro_norm)
        
        # Need minimum data for CWT
        if len(self.gyro_norm_buffer) < 50:
            return 0.0
        
        # Take recent samples for local CWT
        window = np.array(list(self.gyro_norm_buffer)[-100:])
        
        # Apply CWT with gaus2 wavelet
        try:
            widths = np.array([self.cwt_scale])
            cwt_matrix = signal.cwt(window, signal.ricker, widths)
            cwt_value = abs(cwt_matrix[0, -1])  # Take last value
        except Exception as e:
            cwt_value = gyro_norm  # Fallback to raw value
            
        # Store for peak detection
        self.cwt_buffer.append(cwt_value)
        self.recent_cwt_values.append(cwt_value)
        
        return cwt_value
    
    def update_adaptive_threshold(self, peak_height):
        """
        Update adaptive threshold based on detected peaks.
        Uses 10th percentile of recent peak heights.
        
        Args:
            peak_height: Height of newly detected peak
        """
        self.peak_heights_history.append(peak_height)
        
        if len(self.peak_heights_history) >= 5:
            heights = np.array(self.peak_heights_history)
            self.adaptive_threshold = np.percentile(heights, self.threshold_percentile)
            # Ensure minimum threshold to avoid noise
            self.adaptive_threshold = max(self.adaptive_threshold, 0.3)
    
    def detect_local_peak(self):
        """
        Detect if current sample is a local peak in CWT signal.
        
        Returns:
            tuple: (is_peak, peak_height)
        """
        if len(self.recent_cwt_values) < 5:
            return False, 0.0
        
        values = list(self.recent_cwt_values)
        # Check if middle value is peak (higher than neighbors)
        mid_idx = len(values) // 2
        mid_val = values[mid_idx]
        
        is_peak = True
        for i, val in enumerate(values):
            if i != mid_idx and val >= mid_val:
                is_peak = False
                break
        
        return is_peak, mid_val
    
    def update(self, gx, gy, gz, timestamp_ms):
        """
        Main update function - process one IMU sample.
        
        Args:
            gx, gy, gz: Gyroscope values in rad/s
            timestamp_ms: Current timestamp in milliseconds
            
        Returns:
            dict: {
                'is_walking': bool,
                'gyro_norm': float,
                'cwt_value': float,
                'step_detected': bool,
                'bout_valid': bool,
                'steps_in_bout': int
            }
        """
        # 1. Calculate Gyro Norm
        gyro_norm = self.calculate_norm(gx, gy, gz)
        
        # 2. Apply CWT
        cwt_value = self.apply_cwt_realtime(gyro_norm)
        self.timestamp_buffer.append(timestamp_ms)
        
        # 3. Detect Local Peak
        is_peak, peak_height = self.detect_local_peak()
        step_detected = False
        
        if is_peak and peak_height > self.adaptive_threshold:
            # Check minimum time since last peak (anti-double-count)
            time_since_last = timestamp_ms - self.last_peak_time
            
            if time_since_last > (self.min_peak_distance * 1000 / self.sample_rate):
                step_detected = True
                self.last_peak_time = timestamp_ms
                self.current_bout_peaks.append(timestamp_ms)
                self.steps_in_current_bout += 1
                
                # Update adaptive threshold
                self.update_adaptive_threshold(peak_height)
                
                # Mark step timing for estimator
                self.step_start_time = timestamp_ms
        
        # 4. Bout Management
        # Check if current bout has ended (gap > 5s)
        if len(self.current_bout_peaks) > 0:
            time_since_last_peak = timestamp_ms - self.current_bout_peaks[-1]
            
            if time_since_last_peak > self.max_gap_ms:
                # Bout ended - validate it
                if len(self.current_bout_peaks) < self.min_steps_per_bout:
                    # Reject bout (< 3 steps)
                    print(f"🚫 [CWT] Bout rejected: only {len(self.current_bout_peaks)} steps")

                # No recent steps anymore, so the current walking state must end here.
                self.is_currently_walking = False

                # Reset for next bout
                self.current_bout_peaks = []
                self.steps_in_current_bout = 0
        
        # 5. Real-time walking state
        # Consider walking if we have active steps and within bout
        bout_valid = len(self.current_bout_peaks) >= self.min_steps_per_bout
        
        # Update walking state in real-time
        if step_detected and len(self.current_bout_peaks) >= self.min_steps_per_bout:
            self.is_currently_walking = True
        
        return {
            'is_walking': self.is_currently_walking,
            'gyro_norm': gyro_norm,
            'cwt_value': cwt_value,
            'step_detected': step_detected,
            'bout_valid': bout_valid,
            'steps_in_bout': self.steps_in_current_bout,
            'adaptive_threshold': self.adaptive_threshold
        }
    
    def is_walking(self):
        """
        Simple API to check if currently walking.
        Used by main.py to gate the estimator.
        
        Returns:
            bool: True if valid walking detected
        """
        return self.is_currently_walking
    
    def get_step_timing(self):
        """
        Get timing of the most recent step.
        Used by gait_estimator for integration window.
        
        Returns:
            tuple: (start_time_ms, end_time_ms) or (None, None)
        """
        return self.step_start_time, self.step_end_time
    
    def reset(self):
        """Reset detector state."""
        self.gyro_norm_buffer.clear()
        self.cwt_buffer.clear()
        self.timestamp_buffer.clear()
        self.recent_cwt_values.clear()
        self.peak_heights_history.clear()
        self.current_bout_peaks = []
        self.is_currently_walking = False
        self.steps_in_current_bout = 0
        self.adaptive_threshold = 0.5
        self.last_peak_time = 0
        print("🔄 CWTWalkingDetector Reset")


# Alias for backward compatibility
WalkingDetector = CWTWalkingDetector
