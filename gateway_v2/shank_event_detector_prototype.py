"""
Live comparison for shank-mounted gait event detection.

This file does NOT modify the production gateway pipeline. It gives us a
side-by-side sandbox to compare:

1. The current norm-based phase logic:
   - toe-off and heel-strike inferred mainly from gyro magnitude
2. A shank-specific FSM:
   - uses sagittal-plane gyro as the primary motion signal
   - uses accel jerk / impact cues to confirm heel-strike

Assumptions:
- Samples are already remapped into the gateway body frame:
  X = forward, Y = left, Z = up
- For the shank prototype, sagittal rotation is approximated by gyro Y.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np


@dataclass
class DetectorResult:
    phase: str
    event: Optional[str]
    debug: Dict[str, float]


class NormBasedShankDetectorPrototype:
    """
    Baseline detector that mirrors the current gyro-norm style logic.

    This is intentionally close to the production estimator so we can compare
    against a more shank-specific FSM without changing live behavior first.
    """

    def __init__(self) -> None:
        self.phase = "STANCE"
        self.gyro_threshold = 0.18
        self.tilt_rate_threshold = 5.24
        self.min_toe_off_gyro_norm = 0.30
        self.min_swing_peak_gyro_norm = 0.75
        self.min_stance_duration_s = 0.10
        self.min_swing_duration_s = 0.24
        self.toe_off_confirm_samples = 2
        self.heel_strike_confirm_samples = 4

        self.stance_start_ms: Optional[float] = None
        self.swing_start_ms: Optional[float] = None
        self.swing_peak_gyro_norm = 0.0
        self.toe_off_candidate_count = 0
        self.heel_strike_candidate_count = 0
        self.gyro_norm_history: deque[float] = deque(maxlen=5)
        self.timestamp_history: deque[float] = deque(maxlen=5)

    @staticmethod
    def _duration_s(start_ms: Optional[float], end_ms: float) -> float:
        if start_ms is None:
            return 0.0
        return max(0.0, (end_ms - start_ms) / 1000.0)

    def update(self, accel: np.ndarray, gyro: np.ndarray, timestamp_ms: float) -> DetectorResult:
        del accel

        gyro_norm = float(np.linalg.norm(gyro))
        tilt_rate = 0.0
        if len(self.gyro_norm_history) >= 2 and len(self.timestamp_history) >= 2:
            ref_norm = self.gyro_norm_history[0]
            ref_time = self.timestamp_history[0]
            dt = (timestamp_ms - ref_time) / 1000.0
            if dt > 0:
                tilt_rate = (gyro_norm - ref_norm) / dt

        self.gyro_norm_history.append(gyro_norm)
        self.timestamp_history.append(timestamp_ms)

        event = None

        if self.phase == "STANCE":
            if self.stance_start_ms is None:
                self.stance_start_ms = timestamp_ms

            stance_duration_s = self._duration_s(self.stance_start_ms, timestamp_ms)
            toe_off_candidate = (
                stance_duration_s >= self.min_stance_duration_s
                and tilt_rate > self.tilt_rate_threshold
                and gyro_norm >= self.min_toe_off_gyro_norm
            )
            self.toe_off_candidate_count = self.toe_off_candidate_count + 1 if toe_off_candidate else 0
            self.heel_strike_candidate_count = 0

            if self.toe_off_candidate_count >= self.toe_off_confirm_samples:
                self.phase = "SWING"
                self.swing_start_ms = timestamp_ms
                self.swing_peak_gyro_norm = gyro_norm
                self.toe_off_candidate_count = 0
                event = "TOE_OFF"

        else:
            self.swing_peak_gyro_norm = max(self.swing_peak_gyro_norm, gyro_norm)
            swing_duration_s = self._duration_s(self.swing_start_ms, timestamp_ms)
            heel_strike_candidate = (
                swing_duration_s >= self.min_swing_duration_s
                and self.swing_peak_gyro_norm >= self.min_swing_peak_gyro_norm
                and gyro_norm < self.gyro_threshold
            )
            self.heel_strike_candidate_count = self.heel_strike_candidate_count + 1 if heel_strike_candidate else 0
            self.toe_off_candidate_count = 0

            if self.heel_strike_candidate_count >= self.heel_strike_confirm_samples:
                self.phase = "STANCE"
                self.stance_start_ms = timestamp_ms
                self.heel_strike_candidate_count = 0
                event = "HEEL_STRIKE"

        return DetectorResult(
            phase=self.phase,
            event=event,
            debug={
                "gyro_norm": gyro_norm,
                "tilt_rate": tilt_rate,
                "swing_peak_gyro_norm": self.swing_peak_gyro_norm,
                "toe_off_candidates": float(self.toe_off_candidate_count),
                "heel_strike_candidates": float(self.heel_strike_candidate_count),
            },
        )


class SagittalGyroFSMPrototype:
    """
    Shank-specific detector using sagittal gyro plus accel impact cues.

    State flow:
        STANCE -> PRE_SWING -> MID_SWING -> TERMINAL_SWING -> STANCE

    Why this is more suitable for shank IMUs:
    - The sagittal component of shank angular velocity is highly structured.
    - Heel-strike is confirmed by a post-swing impact signature, not just low gyro.
    """

    def __init__(self, side: str = "L", sagittal_sign: Optional[float] = None) -> None:
        side = side.upper()
        if sagittal_sign is None:
            sagittal_sign = 1.0 if side == "L" else -1.0

        self.side = side
        self.sagittal_sign = float(sagittal_sign)
        self.phase = "STANCE"

        self.sagittal_history: deque[float] = deque(maxlen=5)
        self.timestamp_history: deque[float] = deque(maxlen=5)
        self.prev_accel: Optional[np.ndarray] = None
        self.prev_timestamp_ms: Optional[float] = None

        self.stance_start_ms: Optional[float] = None
        self.swing_start_ms: Optional[float] = None
        self.last_event_ms = 0.0

        self.peak_sagittal = 0.0
        self.toe_off_candidate_count = 0
        self.heel_strike_candidate_count = 0

        # Thresholds tuned for remapped shank IMUs.
        self.min_event_interval_ms = 220.0
        self.min_stance_duration_s = 0.10
        self.min_swing_duration_s = 0.20
        self.max_swing_duration_s = 2.00

        self.toe_off_gyro_threshold = 0.55
        self.toe_off_slope_threshold = 4.0
        self.pre_swing_peak_threshold = 1.20
        self.terminal_sagittal_threshold = 0.55
        self.terminal_slope_threshold = -2.5
        self.heel_strike_low_gyro = 0.35
        self.impact_jerk_threshold = 18.0
        self.impact_accel_norm_threshold = 11.2
        self.toe_off_confirm_samples = 2
        self.heel_strike_confirm_samples = 2

    @staticmethod
    def _duration_s(start_ms: Optional[float], end_ms: float) -> float:
        if start_ms is None:
            return 0.0
        return max(0.0, (end_ms - start_ms) / 1000.0)

    def _get_sagittal_gyro(self, gyro: np.ndarray) -> float:
        # With gateway remapping, +Y is the lateral axis. Rotations around Y are
        # the dominant shank flexion/extension motion in the sagittal plane.
        return float(self.sagittal_sign * gyro[1])

    def _smooth_sagittal(self, sagittal_gyro: float, timestamp_ms: float) -> tuple[float, float]:
        self.sagittal_history.append(sagittal_gyro)
        self.timestamp_history.append(timestamp_ms)

        smoothed = float(np.mean(self.sagittal_history))
        slope = 0.0
        if len(self.sagittal_history) >= 2 and len(self.timestamp_history) >= 2:
            dt = (self.timestamp_history[-1] - self.timestamp_history[0]) / 1000.0
            if dt > 0:
                slope = (self.sagittal_history[-1] - self.sagittal_history[0]) / dt
        return smoothed, slope

    def _compute_impact_features(self, accel: np.ndarray, timestamp_ms: float) -> tuple[float, float]:
        accel_norm = float(np.linalg.norm(accel))
        jerk_norm = 0.0
        if self.prev_accel is not None and self.prev_timestamp_ms is not None:
            dt = (timestamp_ms - self.prev_timestamp_ms) / 1000.0
            if dt > 0:
                jerk_norm = float(np.linalg.norm(accel - self.prev_accel) / dt)

        self.prev_accel = accel.copy()
        self.prev_timestamp_ms = timestamp_ms
        return accel_norm, jerk_norm

    def update(self, accel: np.ndarray, gyro: np.ndarray, timestamp_ms: float) -> DetectorResult:
        sagittal_gyro = self._get_sagittal_gyro(gyro)
        gyro_norm = float(np.linalg.norm(gyro))
        smoothed_sagittal, sagittal_slope = self._smooth_sagittal(sagittal_gyro, timestamp_ms)
        accel_norm, jerk_norm = self._compute_impact_features(accel, timestamp_ms)

        event = None
        time_since_last_event = timestamp_ms - self.last_event_ms

        if self.phase == "STANCE":
            if self.stance_start_ms is None:
                self.stance_start_ms = timestamp_ms

            stance_duration_s = self._duration_s(self.stance_start_ms, timestamp_ms)
            toe_off_candidate = (
                stance_duration_s >= self.min_stance_duration_s
                and time_since_last_event >= self.min_event_interval_ms
                and smoothed_sagittal >= self.toe_off_gyro_threshold
                and sagittal_slope >= self.toe_off_slope_threshold
            )
            self.toe_off_candidate_count = self.toe_off_candidate_count + 1 if toe_off_candidate else 0
            self.heel_strike_candidate_count = 0

            if self.toe_off_candidate_count >= self.toe_off_confirm_samples:
                self.phase = "PRE_SWING"
                self.swing_start_ms = timestamp_ms
                self.peak_sagittal = smoothed_sagittal
                self.toe_off_candidate_count = 0
                self.last_event_ms = timestamp_ms
                event = "TOE_OFF"

        elif self.phase == "PRE_SWING":
            self.peak_sagittal = max(self.peak_sagittal, smoothed_sagittal)

            if smoothed_sagittal >= self.pre_swing_peak_threshold:
                self.phase = "MID_SWING"
            elif self._duration_s(self.swing_start_ms, timestamp_ms) > 0.20 and smoothed_sagittal < 0.15:
                # Abort false starts early so we do not get stuck outside stance.
                self.phase = "STANCE"
                self.stance_start_ms = timestamp_ms

        elif self.phase == "MID_SWING":
            self.peak_sagittal = max(self.peak_sagittal, smoothed_sagittal)

            if (
                self.peak_sagittal >= self.pre_swing_peak_threshold
                and smoothed_sagittal <= self.terminal_sagittal_threshold
                and sagittal_slope <= self.terminal_slope_threshold
            ):
                self.phase = "TERMINAL_SWING"

        elif self.phase == "TERMINAL_SWING":
            swing_duration_s = self._duration_s(self.swing_start_ms, timestamp_ms)
            impact_detected = jerk_norm >= self.impact_jerk_threshold or accel_norm >= self.impact_accel_norm_threshold
            heel_strike_candidate = (
                self.min_swing_duration_s <= swing_duration_s <= self.max_swing_duration_s
                and time_since_last_event >= self.min_event_interval_ms
                and abs(smoothed_sagittal) <= self.heel_strike_low_gyro
                and impact_detected
            )
            self.heel_strike_candidate_count = self.heel_strike_candidate_count + 1 if heel_strike_candidate else 0

            if self.heel_strike_candidate_count >= self.heel_strike_confirm_samples:
                self.phase = "STANCE"
                self.stance_start_ms = timestamp_ms
                self.heel_strike_candidate_count = 0
                self.last_event_ms = timestamp_ms
                event = "HEEL_STRIKE"
            elif swing_duration_s > self.max_swing_duration_s:
                # Hard recovery path to avoid hanging in terminal swing forever.
                self.phase = "STANCE"
                self.stance_start_ms = timestamp_ms

        return DetectorResult(
            phase=self.phase,
            event=event,
            debug={
                "gyro_norm": gyro_norm,
                "sagittal_gyro": smoothed_sagittal,
                "sagittal_slope": sagittal_slope,
                "peak_sagittal": self.peak_sagittal,
                "accel_norm": accel_norm,
                "jerk_norm": jerk_norm,
                "toe_off_candidates": float(self.toe_off_candidate_count),
                "heel_strike_candidates": float(self.heel_strike_candidate_count),
            },
        )


class ShankEventDetectorComparison:
    """Update both prototype detectors on the same remapped sample stream."""

    def __init__(self, side: str = "L", sagittal_sign: Optional[float] = None) -> None:
        self.norm_detector = NormBasedShankDetectorPrototype()
        self.fsm_detector = SagittalGyroFSMPrototype(side=side, sagittal_sign=sagittal_sign)

    def update(self, accel: list[float], gyro: list[float], timestamp_ms: float) -> Dict[str, object]:
        accel_np = np.asarray(accel, dtype=float)
        gyro_np = np.asarray(gyro, dtype=float)
        norm_result = self.norm_detector.update(accel_np, gyro_np, timestamp_ms)
        fsm_result = self.fsm_detector.update(accel_np, gyro_np, timestamp_ms)
        return {
            "timestamp_ms": timestamp_ms,
            "norm": norm_result,
            "fsm": fsm_result,
        }
