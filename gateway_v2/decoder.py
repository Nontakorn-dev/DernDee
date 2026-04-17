import struct

# Packet V1 (from esp32_IMU_Ver2):
# [Magic(2), Version(1), Seq(2), Timestamp_us(4),
#  ax(2), ay(2), az(2), gx(2), gy(2), gz(2), CRC8(1)]
# Total: 2 + 1 + 2 + 4 + 6 + 6 + 1 = 22 bytes
PACKET_SIZE = 22
HEADER = 0xAA55

def calculate_crc8(data_bytes):
    """CRC-8-ATM (poly 0x07, init 0x00) - matches ESP32 calcCRC8()."""
    crc = 0x00
    for b in data_bytes:
        crc ^= b
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ 0x07) & 0xFF
            else:
                crc = (crc << 1) & 0xFF
    return crc

def decode_packet(data):
    """
    Decodes a 22-byte ImuPacketV1 from ESP32.
    Returns dict if valid, None if invalid.
    """
    if len(data) != PACKET_SIZE:
        print(f"Invalid size: {len(data)}")
        return None

    # < = little endian
    # H = uint16 (magic)
    # B = uint8  (version)
    # H = uint16 (seq)
    # I = uint32 (timestamp_us)
    # h = int16  (ax, ay, az, gx, gy, gz)
    # B = uint8  (crc8)
    try:
        magic, version, seq, timestamp_us, ax, ay, az, gx, gy, gz, crc8 = struct.unpack('<HBHIhhhhhhB', data)
    except struct.error as e:
        print(f"Struct Error: {e}")
        return None

    if magic != HEADER:
        print(f"Invalid Header: {hex(magic)}")
        return None

    # Verify CRC-8
    calc_crc = calculate_crc8(data[:-1])
    if calc_crc != crc8:
        print(f"CRC8 Fail: Calc {calc_crc} vs Recv {crc8}")
        return None

    return {
        "raw_accel": (ax, ay, az),
        "raw_gyro": (gx, gy, gz),
        "timestamp": timestamp_us / 1000.0,  # µs → ms for downstream compatibility
        "seq": seq
    }
