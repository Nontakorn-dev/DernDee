import struct

# Structure: [Header(2), gx(2), gy(2), gz(2), ax(2), ay(2), az(2), Time(4), Checksum(1)]
# Total: 2 + 6 + 6 + 4 + 1 = 19 bytes
PACKET_SIZE = 19
HEADER = 0xAA55

def calculate_checksum(data_bytes):
    """XOR sum of all bytes except the last one (checksum itself)."""
    csum = 0
    # Process all bytes except the last one
    for b in data_bytes[:-1]:
        csum ^= b
    return csum

def decode_packet(data):
    """
    Decodes a 19-byte binary packet from ESP32.
    Returns dict if valid, None if invalid.
    """
    if len(data) != PACKET_SIZE:
        print(f"Invalid size: {len(data)}")
        return None

    # Unpack
    # < = little endian
    # H = uint16 (Header)
    # h = int16 (6 values)
    # I = uint32 (Timestamp)
    # B = uint8 (Checksum)
    try:
        header, gx, gy, gz, ax, ay, az, timestamp, checksum = struct.unpack('<HhhhhhhIB', data)
    except struct.error as e:
        print(f"Struct Error: {e}")
        return None

    if header != HEADER:
        print(f"Invalid Header: {hex(header)}")
        return None

    # Verify Checksum
    calc_csum = calculate_checksum(data)
    if calc_csum != checksum:
        print(f"Checksum Fail: Calc {calc_csum} vs Recv {checksum}")
        return None

    return {
        "raw_accel": (ax, ay, az),
        "raw_gyro": (gx, gy, gz),
        "timestamp": timestamp
    }
