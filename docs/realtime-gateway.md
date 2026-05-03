# Realtime Gateway And Firmware

อัปเดตตามโค้ดใน repository นี้ ณ วันที่ 2026-05-01

## 1. ภารกิจของ `gateway_v2`

`gateway_v2` เป็นตัวกลางที่เชื่อม BLE IMU กับ frontend และ Supabase โดยตรง

หน้าที่หลักของมันคือ:

- scan และเชื่อม BLE devices
- decode packet จาก firmware
- broadcast `DATA` payloads แบบ realtime ผ่าน WebSocket
- รับ control messages จาก frontend เช่น `CALIBRATE`, `RESET`, `START_SESSION`, `END_SESSION`
- persist completed sessions ไป Supabase จาก summary/details ที่ frontend คำนวณมาให้

## 2. ไฟล์สำคัญใน gateway

| File | Responsibility |
| --- | --- |
| `main.py` | orchestration หลัก, WebSocket server, command handling, raw stream broadcast |
| `connection.py` | BLE scanning และ device management |
| `decoder.py` | decode packet จาก firmware |
| `session_persistence.py` | session lifecycle และ Supabase persistence |

## 3. Runtime pipeline

flow หลักเมื่อ packet เข้ามา:

1. `decode_packet(data)`
2. infer `side` และ `sensor_mount` จากชื่ออุปกรณ์
3. broadcast payload ดิบไปทุก WebSocket clients

สิ่งนี้เกิดใน `data_handler` ที่ `gateway_v2/main.py`

## 4. WebSocket contract

server endpoint ปัจจุบัน:

- `ws://<host>:8765`

### Commands จาก frontend ไป gateway

| Message | Meaning |
| --- | --- |
| `CALIBRATE` | reset calibration timer และ broadcast `CALIBRATION_START` |
| `RESET` | reset runtime session state |
| `START_SESSION` | เปิด active session ใน memory พร้อม `patient_id` และ `session_type` |
| `END_SESSION` | ปิด session และ persist summary/details/gait rows ไป Supabase |

### Events จาก gateway ไป frontend

| Event | Meaning |
| --- | --- |
| `CALIBRATION_START` | calibration เริ่มแล้ว |
| `CALIBRATION_DONE` | calibration timer ครบและพร้อมเริ่ม session |
| `SYSTEM_RESET` | runtime state ถูก reset |
| `SESSION_STARTED` | active session ถูกเปิดแล้ว |
| `SESSION_SAVED` | session ถูก persist แล้ว |
| `SESSION_SAVE_FAILED` | persistence failed |
| `DATA` | payload realtime หลักของระบบ |

### ฟิลด์สำคัญใน `DATA`

- `raw_accel`, `raw_gyro`
- `timestamp_ms`
- `side`
- `sensor_mount`

## 5. Persistence policy ปัจจุบัน

### Free Walk

- persist `sessions`
- persist `gait_metrics` รายก้าวที่ frontend ส่งกลับมาผ่าน `END_SESSION`

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

- reset runtime-only state ของ active session เดิม
- create active session in memory
- เก็บ `patient_id`, `session_type`, และ metadata ที่มากับ payload

### ตอนระหว่าง session

- realtime raw payloads ถูก broadcast ไป browser
- frontend เป็นผู้คำนวณ gait metrics, game logic, และ session summary

### ตอนจบ session

`END_SESSION` จะเรียก `session_persistence.end_session(...)`

สิ่งที่เกิดขึ้น:

- ใช้ summary ที่ frontend ส่งมาเป็น source of truth สำหรับ session metrics
- merge game-specific `details`
- insert row ลง `sessions`
- insert rows ลง `gait_metrics` เฉพาะ session types ที่อนุญาตและ frontend ส่ง row มา

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
- `python-dotenv`
- `supabase`
- `websockets`

## 9. Environment variables ของ gateway

ใน `gateway_v2/.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

service role key ถูกใช้เฉพาะฝั่ง gateway เพื่อ persist session data เท่านั้น ไม่ควร expose ไป browser runtime

## 10. ข้อจำกัดและข้อควรระวัง

- gateway ต้องรันบนเครื่องที่เข้าถึง BLE ได้จริง
- frontend ที่ deploy บน static hosting อย่างเดียวจะไม่แทน gateway เพราะยังต้องมี BLE + WebSocket bridge
- ถ้า gateway ถูกปิดก่อน `END_SESSION` session นั้นอาจไม่ถูก persist ครบ
- game sessions ที่เป็น summary-only จะไม่มี per-step CSV/export dataset เหมือน Free Walk