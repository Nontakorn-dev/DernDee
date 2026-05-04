# Realtime Browser BLE

อัปเดตตามโค้ดใน repository นี้ ณ วันที่ 2026-05-04

## 1. ภารกิจของ realtime transport ปัจจุบัน

ระบบ realtime ของ DernDee ไม่ใช้ Python gateway แล้ว

หน้าที่หลักถูกย้ายมาอยู่ใน browser ผ่าน `DernDee_Web-app/shared/gateway/realtimeTransport.js`

สิ่งที่ transport นี้ทำคือ:

- pair BLE sensors ผ่าน Web Bluetooth
- decode Packet V1 จาก firmware ใน browser
- broadcast `DATA` payloads ไปทุก screen ที่เปิด `createRealtimeConnection()`
- emulation control messages เช่น `CALIBRATE`, `RESET`, `START_SESSION`, `END_SESSION`
- keep device assignments ไว้ใน `sessionStorage` เพื่อ reuse ข้าม route
- ทำงานร่วมกับ session outbox ใน IndexedDB เพื่อให้ therapy sessions ถูกเก็บก่อนแม้ network จะหลุด

## 2. ไฟล์สำคัญ

| File | Responsibility |
| --- | --- |
| `DernDee_Web-app/shared/gateway/realtimeTransport.js` | transport manager, Browser BLE sockets, control-message emulation |
| `DernDee_Web-app/apps/patient/src/components/DeviceConnection.jsx` | pair/unpair sensors และดูสถานะ packet stream |
| `DernDee_Web-app/shared/hooks/usePersistedGatewaySession.js` | ส่ง session lifecycle commands ผ่าน transport และ persist session จาก frontend |
| `DernDee_Web-app/shared/services/sessionService.js` | queue sessions locally, sync to Supabase, query history |
| `DernDee_Web-app/shared/services/sessionOutbox.js` | IndexedDB outbox สำหรับ pending sessions |
| `DernDee_Web-app/shared/hooks/useOfflineSessionSync.js` | monitor online or offline state และ flush queue ตอน reconnect |
| `DernDee_Web-app/shared/gait/gaitProcessorClient.js` | worker-backed analysis client สำหรับ GaitProcessor |

## 3. Runtime pipeline

เมื่อ packet เข้ามาจาก characteristic:

1. `decodePacket(buffer)`
2. infer `side` และ `sensor_mount` จากชื่ออุปกรณ์
3. broadcast `DATA` payloads ไปทุก BrowserBleSocket
4. แต่ละ route เช่น Calibration, WalkSession, High Stepper, Magic Plate, Rhythm Drummer, และ gait dashboard อ่าน raw stream เดียวกันนี้
5. เส้นทางที่ใช้ `GaitProcessor` จะส่ง sample ต่อเข้า Web Worker แทนการ analyze บน main thread

## 4. In-browser message contract

transport ยังคง interface เดิมเพื่อไม่ให้ patient app และ gait dashboard ต้องแก้ flow เยอะ

### Commands

| Message | Meaning |
| --- | --- |
| `CALIBRATE` | เริ่ม calibration timer 3 วินาทีใน browser |
| `RESET` | reset transport runtime state |
| `START_SESSION` | เปิด active session metadata ใน memory |
| `END_SESSION` | ปิด active session และให้ frontend persist summary/details |

### Events

| Event | Meaning |
| --- | --- |
| `CALIBRATION_START` | calibration เริ่มแล้ว |
| `CALIBRATION_DONE` | calibration timer ครบแล้ว |
| `CALIBRATION_FAILED` | ยังไม่มี sensor ที่เชื่อมอยู่ |
| `SYSTEM_RESET` | runtime state ถูก reset |
| `SESSION_STARTED` | active session ถูกเปิดแล้ว |
| `SESSION_SAVED` | frontend persist session สำเร็จ |
| `DATA` | payload realtime หลักของระบบ |

### ฟิลด์หลักใน `DATA`

- `raw_accel`, `raw_gyro`
- `timestamp_ms`
- `side`
- `sensor_mount`
- `seq`

## 5. Persistence policy

### Free Walk

- frontend queue `sessions` ลง IndexedDB ก่อน
- frontend queue `gait_metrics` รายก้าวลง IndexedDB ก่อน
- ถ้า online จะ sync ไป Supabase ทันที; ถ้า offline จะรอ reconnect แล้ว flush ภายหลัง

### High Stepper / Magic Plate / Rhythm Drummer

- frontend queue `sessions` ลง IndexedDB ก่อน
- frontend queue `sessions.details` ลง IndexedDB ก่อน
- ไม่ persist `gait_metrics` รายก้าว

## 6. Browser requirements

- ใช้ browser ที่รองรับ Web Bluetooth เช่น Chromium-based browser หรือ Bluefy บน iOS
- user gesture จำเป็นสำหรับการ pair sensor ครั้งแรก
- ถ้า browser รองรับ `navigator.bluetooth.getDevices()` ระบบจะพยายาม reuse permission เดิมให้ข้าม route ได้

## 7. Firmware compatibility

- runtime ปัจจุบัน decode Packet V1 จาก `Hardware/esp32_imu_node.ino`
- firmware เก่าอื่นใน `Hardware/` ยังควรมองเป็น reference จนกว่าจะยืนยัน packet compatibility ใหม่

## 8. Local runbook

```bash
cd DernDee_Web-app
npm install
npm run dev
```

จากนั้น:

1. เปิด patient app
2. เข้า `DeviceConnection`
3. pair sensors ผ่านปุ่ม `Connect via BLE`
4. ไป `Calibration` หรือ route อื่นต่อได้เลยโดยไม่ต้องเปิด process เพิ่ม

## 9. ข้อจำกัดและข้อควรระวัง

- BLE จะทำงานได้เฉพาะใน browser และ device ที่รองรับ Web Bluetooth
- browser จะเป็นเจ้าของ realtime session lifecycle เอง ดังนั้น session ที่อยู่ใน IndexedDB outbox ยังต้องกลับมาเปิด app เพื่อ flush ถ้า service worker ยังไม่ถือ auth context ของผู้ใช้
- deployment แบบ static hosting ใช้ได้ ถ้าเครื่องผู้ใช้รองรับ Web Bluetooth และเข้าถึง sensor BLE โดยตรง