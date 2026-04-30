import math

# MPU9250 Scales (Optimized for Gait Analysis)
# ⚠️ MUST MATCH ESP32 FIRMWARE SETTINGS!
ACCEL_SCALE = 4096.0   # LSB/g (+/- 8g) - Heel strike can reach 3-6g
GYRO_SCALE = 16.4      # LSB/dps (+/- 2000dps) - Swing phase can reach 400-600 dps
G_CONST = 9.81
DEG_TO_RAD = math.pi / 180.0

def scale_data(raw_data):
    """
    Converts raw LSB values to physical units.
    Accel -> m/s^2
    Gyro -> rad/s
    """
    ax_raw, ay_raw, az_raw = raw_data["raw_accel"]
    gx_raw, gy_raw, gz_raw = raw_data["raw_gyro"]

    # Accel: LSB -> g -> m/s^2
    ax = (ax_raw / ACCEL_SCALE) * G_CONST
    ay = (ay_raw / ACCEL_SCALE) * G_CONST
    az = (az_raw / ACCEL_SCALE) * G_CONST

    # Gyro: LSB -> dps -> rad/s
    gx = (gx_raw / GYRO_SCALE) * DEG_TO_RAD
    gy = (gy_raw / GYRO_SCALE) * DEG_TO_RAD
    gz = (gz_raw / GYRO_SCALE) * DEG_TO_RAD

    return {
        "accel": (ax, ay, az),
        "gyro": (gx, gy, gz),
        "timestamp": raw_data["timestamp"]  # Use ESP32 timestamp (ms) for accurate dt
    }
