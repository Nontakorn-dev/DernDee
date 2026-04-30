# Realtime Gateway And Firmware

อัปเดตตามโค้ดใน repository นี้ ณ วันที่ 2026-05-01

## 1. ภารกิจของ `gateway_v2`

`gateway_v2` เป็นตัวกลางที่เชื่อม BLE IMU กับ frontend และ Supabase โดยตรง

หน้าที่หลักของมันคือ:

- scan และเชื่อม BLE devices
- decode packet จาก firmware
- scale raw sensor values เป็นหน่วยฟิสิกส์
- run calibration และ orientation initialization
- detect walking bouts
- estimate gait metrics จาก ZUPT-based pipeline
- generate therapist-style feedback
- broadcast `DATA` payloads แบบ realtime ผ่าน WebSocket
- persist completed sessions ไป Supabase

## 2. ไฟล์สำคัญใน gateway

| File | Responsibility |
| --- | --- |
| `main.py` | orchestration หลัก, WebSocket server, command handling, realtime pipeline |
| `connection.py` | BLE scanning และ device management |
| `decoder.py` | decode packet จาก firmware |
| `scaling.py` | แปลง raw samples เป็น physical units |
| `calibration.py` | static calibration flow |
| `shoe_detector.py` | CWT-based walking detector |
| `gait_estimator.py` | ZUPT estimator และ dual-foot analysis |
| `feedback_engine.py` | generate therapist-style feedback |
| `session_persistence.py` | session lifecycle และ Supabase persistence |
| `shank_event_detector_prototype.py` | prototype comparator สำหรับ shank-mounted analysis |

## 3. Runtime pipeline

flow หลักเมื่อ packet เข้ามา:

1. `decode_packet(data)`
2. `scale_data(raw)`
3. axis remapping ให้ตรง target body frame
4. calibration correction และ accel scaling
5. CWT walking detector update
6. ZUPT estimator update
7. dual-foot analyzer update
8. feedback engine analyze step
9. broadcast payload ไปทุก WebSocket clients

สิ่งนี้เกิดใน `data_handler` ที่ `gateway_v2/main.py`

## 4. WebSocket contract

server endpoint ปัจจุบัน:

- `ws://<host>:8765`

### Commands จาก frontend ไป gateway

| Message | Meaning |
| --- | --- |
| `CALIBRATE` | reset runtime state แล้วเริ่ม calibration |
| `RESET` | reset detector/estimator runtime state |
| `START_SESSION` | เปิด active session ใน memory พร้อม `patient_id` และ `session_type` |
| `END_SESSION` | ปิด session และ persist summary/details ไป Supabase |

### Events จาก gateway ไป frontend

| Event | Meaning |
| --- | --- |
| `CALIBRATION_START` | calibration เริ่มแล้ว |
| `CALIBRATION_DONE` | calibration สำเร็จ |
| `CALIBRATION_FAILED` | calibration ไม่สำเร็จ |
| `SYSTEM_RESET` | runtime state ถูก reset |
| `SESSION_STARTED` | active session ถูกเปิดแล้ว |
| `SESSION_SAVED` | session ถูก persist แล้ว |
| `SESSION_SAVE_FAILED` | persistence failed |
| `DATA` | payload realtime หลักของระบบ |

### ฟิลด์สำคัญใน `DATA`

- `raw_accel`, `raw_gyro`
- `is_walking`, `step_detected`, `gyro_norm`, `cwt_value`, `adaptive_threshold`
- `position`, `velocity`, `quaternion`
- `gait_metrics`
- `session_metrics`
- `feedback`

## 5. Persistence policy ปัจจุบัน

### Free Walk

- persist `sessions`
- persist `gait_metrics` รายก้าว

### High Stepper / Magic Plate / Rhythm Drummer

- persist `sessions`
- persist `sessions.details`
- ไม่ persist `gait_metrics` รายก้าว

เหตุผลคือคุม Supabase write volume และเก็บเฉพาะข้อมูลที่จำเป็นต่อ review ระดับ session สำหรับ game modes

### สิ่งที่ไม่เก็บขึ้น Supabase ตรง ๆ

- raw IMU 100 Hz
- realtime `DATA` ทุก frame
- quaternion/position stream ราย sample

## 6. Session lifecycle ใน gateway

### ตอนเริ่ม session

`handle_control_message` จะรับ `START_SESSION` แล้วเรียก `session_persistence.start_session(...)`

สิ่งที่เกิดขึ้น:

- reset runtime-only state
- create active session in memory
- เก็บ `patient_id`, `session_type`, และ metadata ที่มากับ payload

### ตอนระหว่าง session

- realtime payloads ถูก broadcast ไป browser
- ถ้าเป็น session type ที่อนุญาต per-step persistence, gateway จะสะสม `gait_metrics_rows` ไว้ใน memory

### ตอนจบ session

`END_SESSION` จะเรียก `session_persistence.end_session(...)`

สิ่งที่เกิดขึ้น:

- merge session metrics จาก gateway กับ summary overrides จาก frontend
- merge game-specific `details`
- insert row ลง `sessions`
- insert rows ลง `gait_metrics` เฉพาะ session types ที่อนุญาต

## 7. Firmware compatibility

โฟลเดอร์ firmware อยู่ที่ `Hardware/`

ไฟล์ที่ควรมองเป็น current packet-compatible implementation:

- `Hardware/esp32_imu_node.ino`

ข้อเท็จจริงที่สำคัญ:

- gateway decoder ปัจจุบันรองรับ Packet V1 format
- `Hardware/esp32_IMU_Ver2.ino` และ firmware เก่าอื่น ๆ อาจมี packet layout/checksum ไม่ตรงกับ decoder ปัจจุบัน
- ก่อนสลับ firmware ควรตรวจ `decoder.py` กับ payload structure ให้ตรงกันก่อน

## 8. Local runbook

```bash
cd gateway_v2
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 main.py
```

dependencies ปัจจุบันใน `requirements.txt`:

- `bleak`
- `httpx`
- `numpy`
- `python-dotenv`
- `scipy`
- `supabase`
- `websockets`

## 9. Environment variables ของ gateway

ใน `gateway_v2/.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

service role key ถูกใช้เฉพาะฝั่ง gateway เพื่อ persist session data เท่านั้น ไม่ควร expose ไป browser runtime

## 10. ข้อจำกัดและข้อควรระวัง

- gateway ต้องรันบนเครื่องที่เข้าถึง BLE ได้จริง
- frontend ที่ deploy บน static hosting อย่างเดียวจะไม่แทน gateway
- ถ้า gateway ถูกปิดก่อน `END_SESSION` session นั้นอาจไม่ถูก persist ครบ
- game sessions ที่เป็น summary-only จะไม่มี per-step CSV/export dataset เหมือน Free Walk