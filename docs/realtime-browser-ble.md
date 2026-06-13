# Realtime Browser BLE

อัปเดตตามโค้ดใน repository นี้ ณ 2026-05-05

## 1. ขอบเขตของ realtime runtime ปัจจุบัน

realtime path หลักของ DernDee อยู่ใน browser ไม่ได้พึ่ง process กลางนอก frontend

แกนหลักอยู่ที่ `DernDee_Web-app/shared/gateway/realtimeTransport.js`

สิ่งที่ runtime นี้ทำ

- pair BLE sensors ผ่าน Web Bluetooth
- decode packet จาก characteristic notifications ใน browser
- map sensor packets ไปเป็น `DATA` payloads สำหรับหน้าต่าง ๆ ใน app
- emulate control messages เช่น `CALIBRATE`, `RESET`, `START_SESSION`, `END_SESSION`
- จำ device assignments ไว้ใน `sessionStorage`
- ทำงานร่วมกับ session outbox และ doctor live broadcast flow

## 2. Packet contract ที่ decoder รองรับตอนนี้

decoder ปัจจุบันอ่าน packet ขนาด 22 bytes แบบ little-endian ตามโครงสร้างนี้

```text
[magic(2), version(1), seq(2), timestamp_us(4),
 ax(2), ay(2), az(2), gx(2), gy(2), gz(2), crc8(1)]
```

ฟิลด์สำคัญที่ได้จาก `decodePacket(buffer)`

- `raw_accel`
- `raw_gyro`
- `timestamp_ms`
- `seq`

เงื่อนไขที่ packet ต้องผ่านก่อนจะแปลงเป็น payload

- ความยาวต้องเท่ากับ 22 bytes
- magic ต้องเป็น `0xAA55`
- CRC8 ต้องตรง

## 3. Firmware compatibility

- firmware ที่ตรงกับ decoder ปัจจุบันคือ `Hardware/esp32_IMU_Ver2.ino`
- ในไฟล์นี้มีคำอธิบาย Packet V1, sampling 100 Hz, และ CRC8 ตรงกับ logic ใน `realtimeTransport.js`
- `Hardware/esp32_imu_node.ino` ใช้ header, field order, และ checksum คนละแบบ จึงไม่ควรถือว่า compatible กับ frontend runtime ปัจจุบัน

## 4. Sensor slots และการจำ assignments

transport เตรียม body positions ไว้ 5 slot

| Position ID | UI Name | Inferred Mount |
| --- | --- | --- |
| `PELVIS` | Chest | pelvis |
| `LEFT_THIGH` | Left Thigh | thigh |
| `RIGHT_THIGH` | Right Thigh | thigh |
| `LEFT_SHANK` | Left Shank | shank |
| `RIGHT_SHANK` | Right Shank | shank |

พฤติกรรมสำคัญ

- transport ยอมรับชื่ออุปกรณ์ที่ขึ้นต้นด้วย `DernDee`
- device assignments ถูกเก็บใน `sessionStorage`
- ถ้า browser รองรับ `navigator.bluetooth.getDevices()` ระบบจะพยายาม reuse permission เดิม

## 5. Message contract ที่ใช้ใน browser

### Commands

| Message | Meaning |
| --- | --- |
| `CALIBRATE` | เริ่ม calibration timer ใน browser |
| `RESET` | reset transport runtime state |
| `START_SESSION` | เปิด active session metadata ใน memory |
| `END_SESSION` | ปิด active session แล้วให้ frontend persist summary |

### Events

| Event | Meaning |
| --- | --- |
| `CALIBRATION_START` | calibration เริ่มแล้ว |
| `CALIBRATION_DONE` | calibration สำเร็จ |
| `CALIBRATION_FAILED` | ไม่มี sensor ที่พร้อมใช้งาน |
| `SYSTEM_RESET` | runtime state ถูกล้าง |
| `SESSION_STARTED` | active session เปิดแล้ว |
| `SESSION_SAVED` | frontend persist session สำเร็จ |
| `DATA` | realtime payload หลักของระบบ |

## 6. Local patient realtime path

1. user pair sensors ใน `DeviceConnection.jsx`
2. Browser BLE notifications ถูก decode ใน `realtimeTransport.js`
3. transport broadcast `DATA` payloads ให้ route ที่ subscribe อยู่
4. `WalkSession`, games, และ patient gait dashboard ใช้ stream เดียวกัน
5. route ที่ต้องวิเคราะห์ gait ส่ง sample เข้า worker-backed processor ผ่าน `gaitProcessorClient.js`

## 7. Doctor live broadcast path

doctor live dashboard ไม่ได้อ่าน raw stream จาก database polling แต่ใช้ Supabase Realtime Broadcast เป็น relay

ไฟล์ที่เกี่ยวข้อง

- `apps/patient/src/components/PatientLiveGaitMirror.jsx`
- `shared/services/liveGaitBroadcast.js`
- `apps/clinic/src/components/DoctorLiveGaitDashboard.jsx`

flow ปัจจุบัน

1. patient app mount `PatientLiveGaitMirror` ตลอดเวลาที่ user เป็น patient
2. mirror subscribe `DATA` events จาก local Browser BLE transport
3. mirror เลือก active stream โดย prefer sensor ที่เป็น `shank`
4. `liveGaitBroadcast.js` batch samples แล้วส่งผ่าน Supabase Realtime channel `live-gait-stream:<patientId>`
5. doctor route `/clinic/live-gait/:patientId` subscribe channel เดียวกันแล้วป้อน sample เข้า shared gait dashboard runtime ในโหมด `remote-broadcast`

ค่า runtime สำคัญตอนนี้

- `DEFAULT_BATCH_INTERVAL_MS = 80`
- `DEFAULT_MAX_BATCH_SIZE = 24`
- viewer heartbeat ทุก `2000 ms`
- publisher จะส่ง sample เฉพาะตอนที่มี viewer ฝั่ง doctor อยู่จริง

หมายเหตุสำคัญ

- live broadcast payload เก็บ `timestamp_ms` ของ sample ต้นทางไว้แล้ว เพื่อให้ doctor dashboard render กราฟได้เนียนกว่าเดิม
- doctor live dashboard ใช้ shared chart runtime เดียวกับ local gait dashboard แต่ต่างกันที่แหล่ง stream

## 8. ขอบเขตของการ persist

สิ่งที่ runtime นี้ไม่ persist เป็นแถว 100 Hz ลง Supabase tables

- raw packets จาก BLE
- `DATA` payloads ทุก frame
- batches ที่ใช้ใน doctor live dashboard

สิ่งที่ persist ผ่าน frontend persistence path

- completed `sessions`
- `gait_metrics` ของ `free_walk`
- `sessions.details` ของ game modes

## 9. Browser และ deployment requirements

- ใช้ browser ที่รองรับ Web Bluetooth เช่น Chromium-based browser
- user gesture จำเป็นสำหรับการ pair ครั้งแรก
- static hosting ใช้ได้ ตราบใดที่ client browser รองรับ Web Bluetooth และเข้าถึง sensor BLE ได้
- PWA ทำให้ app shell กลับมาเปิดได้ง่ายขึ้น แต่ไม่ได้แทน Web Bluetooth support

## 10. Debug checklist ที่เจอบ่อย

- ถ้า pair ไม่ได้ ให้เช็ก browser support ก่อน
- ถ้า graph ไม่ขึ้น ให้เช็กว่า firmware ที่ใช้ตรงกับ `esp32_IMU_Ver2.ino` หรือไม่
- ถ้า doctor live dashboard ว่าง ให้เช็กว่า patient app ยังเปิดอยู่, Supabase env ถูกต้อง, และ viewer route ใช้ `patientId` ที่ถูกต้อง
- ถ้า deploy แล้วเห็น UI เก่า ให้ลอง hard refresh หรือ unregister service worker
