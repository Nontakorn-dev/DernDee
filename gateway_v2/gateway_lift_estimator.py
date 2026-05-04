from __future__ import annotations

from collections import deque

import numpy as np


class MadgwickAHRS:
    def __init__(self, sample_rate: float = 100.0, beta: float = 0.1) -> None:
        self.sample_rate = sample_rate
        self.beta = beta
        self.q = np.array([1.0, 0.0, 0.0, 0.0], dtype=float)

    def update(self, accel: np.ndarray, gyro: np.ndarray, dt: float | None = None) -> np.ndarray:
        if dt is None:
            dt = 1.0 / self.sample_rate

        q = self.q
        ax, ay, az = accel
        gx, gy, gz = gyro

        norm = np.linalg.norm(accel)
        if norm < 0.01:
            return self.q

        ax, ay, az = ax / norm, ay / norm, az / norm

        q_dot = 0.5 * np.array([
            -q[1] * gx - q[2] * gy - q[3] * gz,
            q[0] * gx + q[2] * gz - q[3] * gy,
            q[0] * gy - q[1] * gz + q[3] * gx,
            q[0] * gz + q[1] * gy - q[2] * gx,
        ])

        objective = np.array([
            (2 * (q[1] * q[3] - q[0] * q[2])) - ax,
            (2 * (q[0] * q[1] + q[2] * q[3])) - ay,
            (2 * (0.5 - q[1] * q[1] - q[2] * q[2])) - az,
        ])

        jacobian = np.array([
            [-2 * q[2], 2 * q[3], -2 * q[0], 2 * q[1]],
            [2 * q[1], 2 * q[0], 2 * q[3], 2 * q[2]],
            [0, -4 * q[1], -4 * q[2], 0],
        ])

        step = jacobian.T @ objective
        step_norm = np.linalg.norm(step)
        if step_norm > 0:
            step = step / step_norm

        q_dot = q_dot - (self.beta * step)
        self.q = q + (q_dot * dt)
        self.q = self.q / np.linalg.norm(self.q)

        return self.q

    def get_quaternion(self) -> np.ndarray:
        return self.q.copy()

    def reset(self) -> None:
        self.q = np.array([1.0, 0.0, 0.0, 0.0], dtype=float)


class GatewayLiftEstimator:
    def __init__(self, sample_rate: float = 100.0, sensor_mount: str = 'shank') -> None:
        self.sample_rate = sample_rate
        self.dt = 1.0 / sample_rate
        self.ahrs = MadgwickAHRS(sample_rate=sample_rate, beta=0.1)
        self.gyro_norm_history = deque(maxlen=5)
        self.gyro_time_history = deque(maxlen=5)
        self.last_gyro_norm = 0.0
        self.set_sensor_mount(sensor_mount)
        self.reset_motion_state()

    def set_sensor_mount(self, sensor_mount: str = 'shank') -> None:
        self.sensor_mount = str(sensor_mount or 'unknown').lower()
        self.gyro_threshold = 0.2
        self.tilt_rate_threshold = 5.24
        self.min_toe_off_gyro_norm = 0.25
        self.min_swing_peak_gyro_norm = 0.5
        self.min_stance_duration_s = 0.08
        self.min_swing_duration_s = 0.18
        self.toe_off_confirm_samples = 2
        self.heel_strike_confirm_samples = 3

        if self.sensor_mount == 'shank':
            self.gyro_threshold = 0.18
            self.min_toe_off_gyro_norm = 0.30
            self.min_swing_peak_gyro_norm = 0.75
            self.min_stance_duration_s = 0.10
            self.min_swing_duration_s = 0.24
            self.toe_off_confirm_samples = 2
            self.heel_strike_confirm_samples = 4

    def reset(self) -> None:
        self.ahrs.reset()
        self.gyro_norm_history.clear()
        self.gyro_time_history.clear()
        self.last_gyro_norm = 0.0
        self.reset_motion_state()

    def reset_motion_state(self) -> None:
        self.is_stance = True
        self.was_stance = True
        self.stance_start_time_ms = None
        self.swing_start_time_ms = None
        self.swing_peak_gyro_norm = 0.0
        self.toe_off_candidate_count = 0
        self.heel_strike_candidate_count = 0
        self.position = np.zeros(3, dtype=float)
        self.velocity = np.zeros(3, dtype=float)

    def rotate_to_world(self, q: np.ndarray, accel_local: np.ndarray) -> np.ndarray:
        w, x, y, z = q
        rotation_matrix = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
            [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
            [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
        ])
        return rotation_matrix @ accel_local

    def _duration_s(self, start_time_ms: float | None, end_time_ms: float) -> float | None:
        if start_time_ms is None:
            return None

        duration_ms = end_time_ms - start_time_ms
        if duration_ms <= 0:
            return None

        return duration_ms / 1000.0

    def detect_stance(self, gyro_norm: float, current_time_ms: float) -> bool:
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

        if self.is_stance:
            stance_duration_s = self._duration_s(self.stance_start_time_ms, current_time_ms) or 0.0
            toe_off_candidate = (
                stance_duration_s >= self.min_stance_duration_s
                and tilt_rate > self.tilt_rate_threshold
                and gyro_norm >= self.min_toe_off_gyro_norm
            )

            self.toe_off_candidate_count = self.toe_off_candidate_count + 1 if toe_off_candidate else 0
            self.heel_strike_candidate_count = 0

            if self.toe_off_candidate_count >= self.toe_off_confirm_samples:
                self.is_stance = False
                self.swing_start_time_ms = current_time_ms
                self.swing_peak_gyro_norm = gyro_norm
                self.toe_off_candidate_count = 0
        else:
            self.swing_peak_gyro_norm = max(self.swing_peak_gyro_norm, gyro_norm)
            swing_duration_s = self._duration_s(self.swing_start_time_ms, current_time_ms) or 0.0
            heel_strike_candidate = (
                swing_duration_s >= self.min_swing_duration_s
                and self.swing_peak_gyro_norm >= self.min_swing_peak_gyro_norm
                and gyro_norm < self.gyro_threshold
            )

            self.heel_strike_candidate_count = self.heel_strike_candidate_count + 1 if heel_strike_candidate else 0
            self.toe_off_candidate_count = 0

            if self.heel_strike_candidate_count >= self.heel_strike_confirm_samples:
                self.is_stance = True
                self.stance_start_time_ms = current_time_ms
                self.heel_strike_candidate_count = 0

        return self.is_stance

    def update(
        self,
        accel: list[float] | tuple[float, float, float],
        gyro: list[float] | tuple[float, float, float],
        timestamp_ms: float,
        dt: float | None = None,
    ) -> dict[str, object]:
        accel_vec = np.asarray(accel, dtype=float)
        gyro_vec = np.asarray(gyro, dtype=float)
        dt = dt if dt is not None else self.dt

        quaternion = self.ahrs.update(accel_vec, gyro_vec, dt)
        gyro_norm = float(np.linalg.norm(gyro_vec))

        accel_world = self.rotate_to_world(quaternion, accel_vec)
        accel_linear = accel_world.copy()
        accel_linear[2] -= 9.81

        self.was_stance = self.is_stance
        is_stance = self.detect_stance(gyro_norm, timestamp_ms)

        if is_stance:
            self.velocity = np.zeros(3, dtype=float)
            self.position = np.zeros(3, dtype=float)
        else:
            velocity_prev = self.velocity.copy()
            self.velocity += accel_linear * dt
            self.position += (velocity_prev + self.velocity) * 0.5 * dt

            max_swing_z = 0.20 if self.sensor_mount == 'shank' else 0.35
            self.position[2] = float(np.clip(self.position[2], 0.0, max_swing_z))
            if self.position[2] <= 0.0 and self.velocity[2] < 0.0:
                self.velocity[2] = 0.0

        return self.get_current_state()

    def get_current_state(self) -> dict[str, object]:
        return {
            'is_stance': self.is_stance,
            'position': self.position.tolist(),
            'velocity': self.velocity.tolist(),
            'quaternion': self.ahrs.get_quaternion().tolist(),
            'gyro_norm': self.last_gyro_norm,
        }