from __future__ import annotations

import math

ACCEL_SCALE = 4096.0
GYRO_SCALE = 16.4
G_CONST = 9.81
DEG_TO_RAD = math.pi / 180.0


def scale_data(raw_data: dict[str, object]) -> dict[str, object]:
    ax_raw, ay_raw, az_raw = raw_data['raw_accel']
    gx_raw, gy_raw, gz_raw = raw_data['raw_gyro']

    ax = (ax_raw / ACCEL_SCALE) * G_CONST
    ay = (ay_raw / ACCEL_SCALE) * G_CONST
    az = (az_raw / ACCEL_SCALE) * G_CONST

    gx = (gx_raw / GYRO_SCALE) * DEG_TO_RAD
    gy = (gy_raw / GYRO_SCALE) * DEG_TO_RAD
    gz = (gz_raw / GYRO_SCALE) * DEG_TO_RAD

    return {
        'accel': (ax, ay, az),
        'gyro': (gx, gy, gz),
        'timestamp': raw_data['timestamp'],
    }