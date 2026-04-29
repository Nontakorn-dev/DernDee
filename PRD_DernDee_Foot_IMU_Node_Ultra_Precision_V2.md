# PRD: DernDee Foot IMU Node (Ultra Precision V2)

## 1. Document Control

- Product: DernDee Foot IMU Node
- Version: 2.0
- Status: Draft for implementation
- Target hardware: ESP32-C3 SuperMini + ICM-20948
- Primary use case: High-fidelity gait sensing for realtime analysis and deep-learning dataset collection
- Backward compatibility target: Maintain Packet V1 compatibility with the current gateway decoder

## 2. Executive Summary

DernDee Foot IMU Node (Ultra Precision V2) is a shoe-mounted wearable sensor node designed to capture gait motion with the highest practical accuracy and stability for everyday rehabilitation use.

This node must prioritize four things above all else:

1. Timing integrity: the outgoing data stream must stay at a stable 100 Hz with minimal jitter.
2. Signal fidelity: the device must transmit raw digital IMU samples without onboard scaling, remapping, or motion fusion.
3. Link stability: BLE streaming must remain robust during normal use and recover automatically after disconnects.
4. System compatibility: the packet format must remain compatible with the current DernDee gateway and analytics pipeline.

The device will use the ICM-20948 only in 6-axis mode, with accelerometer and gyroscope enabled and magnetometer disabled. This is an intentional design decision to reduce environmental magnetic interference and maximize repeatability in real clinical and home settings.

## 3. Product Goals

### 3.1 Primary Goals

- Capture shoe motion data that is stable enough for both realtime gait analytics and offline deep-learning training.
- Stream raw IMU samples continuously at 100 Hz without requiring manual recovery during normal BLE disconnect scenarios.
- Preserve a fixed packet contract so the existing gateway in `gateway_v2/decoder.py` can continue to decode the stream unchanged.
- Minimize firmware-side processing so downstream algorithms receive the highest possible information content.

### 3.2 Success Metrics

- Average output rate: 100.0 Hz with tolerance within +/-0.5% over a continuous 10-minute run.
- Inter-sample timing jitter: <= 0.5 ms at the 95th percentile in nominal lab conditions.
- BLE packet loss: < 0.1% over a 10-minute walking test at 1 meter line-of-sight.
- Disconnect recovery: device resumes advertising without power cycling in >= 99 out of 100 disconnect events.
- Packet compatibility: 100% of packets accepted by the current Packet V1 decoder under nominal operation.

## 4. Non-Goals

- No onboard machine-learning inference.
- No onboard gait parameter calculation.
- No onboard conversion from raw LSB to physical units.
- No onboard axis remapping to world or body frame.
- No onboard magnetometer-based heading fusion.
- No requirement for cross-device clock synchronization in this version.

## 5. System Context

The Foot IMU Node is one component in the larger DernDee stack:

1. Foot node captures raw acceleration and angular velocity.
2. Node transmits Packet V1 over BLE notifications.
3. DernDee gateway receives the packet and validates CRC.
4. Gateway scales, calibrates, detects walking, estimates gait, and publishes WebSocket payloads.
5. Web app and dashboards consume the processed output.

Because calibration, scaling, and gait intelligence already live downstream, firmware must focus on deterministic sampling and reliable delivery.

## 6. Design Principles

- Accuracy over convenience.
- Deterministic timing over feature richness.
- Raw data over smart data.
- Recovery without reboot.
- Backward compatibility unless a change is explicitly approved across firmware, gateway, and frontend.

## 7. Hardware Architecture

### 7.1 Core Components

| Component | Selected Part | Purpose |
| --- | --- | --- |
| Microcontroller | ESP32-C3 SuperMini | BLE peripheral, packetization, timestamping, streaming |
| IMU | ICM-20948 | 9-axis IMU used in 6-axis mode for accel and gyro only |
| Regulator | TPS63020 | Stable 3.3V buck-boost supply |
| Charger | TP4056 | LiPo 1-cell charging |
| Battery | LiPo 1-cell | Portable power source |

### 7.2 IMU Operating Mode

- Accelerometer: enabled
- Gyroscope: enabled
- Magnetometer: disabled
- DMP: disabled
- Output mode: raw digital sensor readings only

### 7.3 Pin Mapping

| Signal | ESP32-C3 Pin | ICM-20948 Pin | Requirement |
| --- | --- | --- | --- |
| I2C SDA | GPIO4 | SDA | Mandatory |
| I2C SCL | GPIO5 | SCL | Mandatory |
| Address select | 3.3V | AD0 | Mandatory, sets I2C address to `0x69` |
| Interface select | 3.3V | NCS | Mandatory, forces I2C mode |
| Power enable | External switch path | TPS63020 EN | Mandatory |
| Data ready interrupt | Recommended spare GPIO | INT1 | Strongly recommended for highest timing precision |

### 7.4 Required Hardware Notes

- The ESP32-C3 target is single-core. Firmware must not depend on multi-core task pinning.
- The ICM-20948 should be placed mechanically close to the shoe body with stable mounting and minimal flex.
- Decoupling and grounding must be designed to minimize supply ripple from the buck-boost converter.
- If hardware revision is possible, the ICM `INT1` pin should be routed to a spare ESP32-C3 GPIO. This is the preferred method for minimizing sampling jitter.

## 8. Functional Requirements

### 8.1 Sampling

- The node shall output one IMU sample every 10 ms.
- The nominal packet stream shall be exactly 100 Hz.
- Sampling timestamps shall be captured at acquisition time, not at BLE transmit completion time.
- Firmware shall preserve sampling stability under continuous operation for at least 30 minutes.

### 8.2 Raw Data Fidelity

- The node shall transmit raw signed 16-bit accelerometer and gyroscope readings in sensor-native axis order.
- The node shall not scale raw values into `g`, `m/s^2`, `dps`, or `rad/s`.
- The node shall not perform quaternion estimation, drift correction, or axis remapping.
- The node shall not average multiple samples unless explicitly required for sensor-side decimation.

### 8.3 Sensor Filtering

- The ICM-20948 internal digital low-pass filter shall be enabled.
- Baseline filter target shall be approximately 41 Hz.
- The firmware shall allow this filter setting to be changed at build time for evaluation if future testing shows a better tradeoff.

### 8.4 BLE Reliability

- On disconnect, the device shall restart advertising automatically without requiring reset or user input.
- The device shall recover from repeated connect-disconnect cycles without memory leak, deadlock, or stalled sampling.
- The device shall keep acquisition isolated from BLE timing as much as possible via buffering.

### 8.5 Boot and Recovery

- On power-up, the node shall initialize the IMU, verify sensor identity, initialize BLE, and begin advertising automatically.
- If IMU initialization fails, the device shall expose a diagnostic error through serial logging and avoid streaming invalid data.
- If BLE is disconnected, the node shall remain operational and continue to be able to re-advertise.

## 9. IMU Configuration Requirements

### 9.1 Mandatory Runtime Configuration

| Parameter | Target Value | Rationale |
| --- | --- | --- |
| I2C address | `0x69` | Matches AD0 tied high |
| I2C bus speed | `400 kHz` | Reduces sensor read latency |
| Accel full scale | `+/-8g` | Preserves heel-strike and foot-lift transients without early clipping |
| Gyro full scale | `+/-2000 dps` | Preserves swing-phase angular velocity |
| DLPF | about `41 Hz` | Baseline noise suppression for walking use |
| Magnetometer | Off | Reduces environmental interference |
| DMP | Off | Keeps output raw and deterministic |

### 9.2 Identity and Safety Checks

- Firmware shall verify the ICM-20948 `WHO_AM_I` value before normal streaming.
- Firmware shall reject streaming if the sensor identity check fails.
- Firmware shall maintain a read error counter for diagnostics.

### 9.3 Preferred Sampling Architecture

For highest precision and stability, the preferred acquisition order is:

1. IMU asserts data-ready interrupt or accumulates sample in FIFO.
2. Firmware reads the sample immediately.
3. Firmware stamps the sample with microsecond-resolution local time.
4. Firmware pushes the sample into a ring buffer.
5. BLE task drains the ring buffer and transmits notifications.

Polling-based acquisition is acceptable only if the hardware cannot expose `INT1`, but the timing guarantees in this PRD are defined against the preferred architecture.

## 10. Firmware Architecture Requirements

### 10.1 Scheduling Model

- Firmware shall be written for a single-core ESP32-C3 execution model.
- Acquisition and BLE transmission shall be decoupled with a ring buffer.
- Sensor acquisition shall always have higher priority than BLE notification packaging.
- The system shall avoid any design that blocks the sampling path on BLE availability.

### 10.2 Buffering and Backpressure

- Firmware shall use a bounded ring buffer to absorb short BLE scheduling delays.
- If the buffer overflows, the event shall be counted in a dropped-sample counter.
- Sequence numbers shall expose packet gaps to the receiver.
- Dropped-sample events shall never corrupt packet structure.

### 10.3 Timestamps

- Packet timestamps shall use microseconds since boot.
- Timestamp width shall remain 32-bit for Packet V1 compatibility.
- Wraparound after about 71.6 minutes shall be documented and tolerated by downstream software.

### 10.4 Diagnostics

Firmware shall maintain at least these diagnostic counters:

- IMU read errors
- Dropped samples due to buffer overflow
- Packets transmitted
- BLE connect count
- BLE disconnect count

Serial diagnostics may be enabled in development builds, but release behavior must not compromise timing.

## 11. BLE Interface Requirements

### 11.1 BLE Role

- Device role: BLE peripheral
- Transport: notifications over a single primary data characteristic

### 11.2 GATT Compatibility

To maintain compatibility with the current DernDee gateway, the node shall preserve these values unless a coordinated protocol migration is approved:

| Field | Value |
| --- | --- |
| Service UUID | `4fafc201-1fb5-459e-8fcc-c5c9c331914b` |
| Characteristic UUID | `beb5483e-36e1-4688-b7f5-ea07361b26a8` |
| MTU target | `64` |

### 11.3 Connection Behavior

- The firmware shall request BLE parameters appropriate for steady 100 Hz notification streaming.
- Preferred connection profile: low latency, no reliance on large slave latency.
- On disconnect, the device shall restart advertising within 500 ms whenever the BLE stack allows it.

## 12. Data Communication Protocol

### 12.1 Packet Version

- Packet name: Packet V1
- Packet size: 22 bytes
- Endianness: little-endian
- Compatibility objective: current gateway decoder must continue to parse packets without modification

### 12.2 Packet Structure

| Field | Size | Type | Description |
| --- | --- | --- | --- |
| Magic | 2 bytes | `uint16_t` | Fixed value `0xAA55` |
| Version | 1 byte | `uint8_t` | Fixed value `0x01` |
| Sequence | 2 bytes | `uint16_t` | Monotonic packet counter with wraparound |
| Timestamp | 4 bytes | `uint32_t` | Microseconds since boot |
| `ax` | 2 bytes | `int16_t` | Raw accel X |
| `ay` | 2 bytes | `int16_t` | Raw accel Y |
| `az` | 2 bytes | `int16_t` | Raw accel Z |
| `gx` | 2 bytes | `int16_t` | Raw gyro X |
| `gy` | 2 bytes | `int16_t` | Raw gyro Y |
| `gz` | 2 bytes | `int16_t` | Raw gyro Z |
| CRC8 | 1 byte | `uint8_t` | CRC-8-ATM over all preceding bytes |

### 12.3 Protocol Rules

- `Magic` shall always equal `0xAA55`.
- `Version` shall always equal `0x01`.
- `Sequence` shall increment by one per packet and wrap naturally at 16 bits.
- `CRC8` shall use the CRC-8-ATM polynomial `0x07` with zero initialization, matching the current gateway decoder.
- Field order shall not change.
- Checksum method shall not be replaced by XOR in this version.

## 13. Accuracy and Stability Requirements

### 13.1 Timing Stability

- Sampling cadence shall remain stable during continuous motion and during BLE reconnect events.
- BLE notification scheduling shall not determine when timestamps are generated.
- The preferred design shall use interrupt-driven or FIFO-driven acquisition instead of loose software polling.

### 13.2 Signal Integrity

- Normal walking must not clip gyro data when using `+/-2000 dps`.
- Normal walking must not clip accel data when using `+/-8g`.
- Static standing data shall show low variance and be stable enough to pass downstream calibration.

### 13.3 Mechanical Stability

- Sensor placement and enclosure shall prevent micro-slippage relative to the shoe during normal gait.
- The product shall define one canonical installation orientation for all data collection sessions.
- Any left/right labeling scheme shall be handled by device naming, not by changing packet format.

## 14. Power and Reliability Requirements

- The device shall boot automatically when output power is enabled.
- The device shall not require a second manual action after power-up.
- Supply noise shall not cause recurring IMU read faults under normal battery voltage range.
- The firmware shall continue to operate correctly across normal battery discharge conditions supported by the regulator.

## 15. Acceptance Tests

| Test ID | Scenario | Pass Criteria |
| --- | --- | --- |
| T1 | Power-on bring-up | Device starts advertising automatically within 2 seconds of power enable |
| T2 | Sensor identity | Correct ICM-20948 identity detected before streaming starts |
| T3 | Packet decode | 100% of packets accepted by the current Packet V1 decoder in a 5-minute stream |
| T4 | Rate stability | Average output rate remains within +/-0.5% of 100 Hz over 10 minutes |
| T5 | Jitter | 95th percentile inter-sample jitter <= 0.5 ms in nominal lab conditions |
| T6 | Disconnect recovery | Device resumes advertising automatically after disconnect without power cycle |
| T7 | Reconnect stress | Device passes 100 connect-disconnect cycles with no lockup |
| T8 | Walking capture | No systematic clipping during normal walking trials |
| T9 | Buffer robustness | Any packet drops are visible through sequence gaps and diagnostic counters |
| T10 | Gateway integration | Existing gateway receives and scales the data without protocol modification |

## 16. Risks and Open Design Notes

### 16.1 Key Risks

- Without wiring the IMU interrupt pin, sampling jitter may be higher than target under BLE load.
- I2C is simpler than SPI but less robust under aggressive timing stress; layout quality is important.
- A 32-bit microsecond timestamp wraps after about 71.6 minutes; downstream software must tolerate wraparound.
- The ICM-20948 register model differs from older MPU-family sketches and must be implemented carefully.

### 16.2 Explicit Design Choices

- Packet format stays unchanged to protect gateway compatibility.
- Magnetometer remains disabled to improve repeatability in real-world environments.
- Raw data remains unscaled to preserve maximum information for deep-learning workflows.
- ESP32-C3 single-core compatibility is mandatory.

## 17. Out-of-Scope Future Enhancements

- Battery telemetry as a secondary BLE characteristic
- Over-the-air firmware update
- Multi-node synchronized timestamping
- On-device self-test reporting to the app
- SPI transport revision for future hardware generations

## 18. Implementation Summary

Ultra Precision V2 shall be considered successful only if it achieves all of the following simultaneously:

1. Stable 100 Hz raw acquisition
2. Packet V1 compatibility
3. Automatic BLE recovery
4. Single-core-safe firmware architecture
5. Low-jitter timing suitable for gait analytics and deep-learning data capture

If a tradeoff is required, the priority order shall be:

1. Timing accuracy
2. Data fidelity
3. Streaming stability
4. Power efficiency
5. Debug convenience