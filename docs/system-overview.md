# System Overview

อัปเดตตามโค้ดใน repository นี้ ณ 2026-05-05

## 1. DernDee ตอนนี้คืออะไร

DernDee เป็น prototype ระบบฟื้นฟูการเดินแบบ realtime ที่รวม 4 ชั้นหลักไว้ใน repo เดียว

1. firmware บน ESP32 IMU
2. Browser BLE transport และ shared gait logic ใน frontend
3. React web apps สำหรับ patient และ clinic
4. Supabase สำหรับ auth, profile, session history, review workflow, และ live relay สำหรับ doctor dashboard

เป้าหมายของระบบคือให้ patient ใช้งาน sensor จริงจาก browser, ให้ frontend วิเคราะห์ gait และ game logic จาก raw stream, และให้ doctor อ่าน history หรือดู live stream ของ patient ผ่าน clinic app

## 2. โครงสร้างระบบปัจจุบัน

### Frontend

- path หลัก: `DernDee_Web-app/`
- framework: React 18, Vite 4, React Router 6
- HTML entry จริงมี 2 ตัว
  - `apps/patient/index.html`
  - `apps/clinic/index.html`
- shared modules อยู่ใน `DernDee_Web-app/shared/`
- `gait-dashboard` หลักเป็น route ใน patient app ที่ `/gait-dashboard`
- doctor live dashboard เป็น route ใน clinic app ที่ `/clinic/live-gait/:patientId`

### Realtime transport

- path หลัก: `DernDee_Web-app/shared/gateway/realtimeTransport.js`
- ทำหน้าที่ pair BLE devices, decode packet ใน browser, เก็บ device assignments ไว้ใน `sessionStorage`, และ broadcast control หรือ `DATA` messages ให้ screen ต่าง ๆ ที่ subscribe อยู่
- ไม่มี Python gateway runtime ใน repo ปัจจุบันแล้ว

### Shared gait runtime

- `DernDee_Web-app/shared/gait/` เก็บ logic สำหรับ filtering, event detection, integration, และ feedback heuristics
- `DernDee_Web-app/shared/gait/gaitProcessor.worker.js` ช่วยย้ายงานวิเคราะห์ออกจาก main thread
- `DernDee_Web-app/shared/gait-dashboard/` เก็บ dashboard runtime, charts, UI bindings, และ styles ที่ใช้ทั้ง local และ remote mode

### Supabase data layer

- auth, profiles, patient presence, sessions, gait metrics, และ doctor review workflow อยู่บน Supabase
- session persistence ถูกเริ่มจาก frontend แล้วค่อย sync ไป Supabase ผ่าน `sessionService.js`
- doctor live dashboard ใช้ Supabase Realtime Broadcast และ Presence เป็น relay ของ live samples ไม่ได้อ่านจากตาราง `gait_metrics` แบบ realtime

### Firmware

- โฟลเดอร์ `Hardware/` เก็บ firmware หลายตัว
- packet ที่ decoder ปัจจุบันรองรับตรง ๆ มาจาก `Hardware/esp32_IMU_Ver2.ino` และ `Hardware/esp32_ICM20948_Ver2.ino`

## 3. โครงสร้าง repo ที่ใช้งานจริง

```text
DernDee_Robustness/
├── README.md
├── docs/
│   ├── README.md
│   ├── system-overview.md
│   ├── frontend-apps.md
│   ├── realtime-browser-ble.md
│   └── supabase-cloud-data-layer.md
├── DernDee_Web-app/
│   ├── apps/
│   │   ├── patient/
│   │   └── clinic/
│   ├── public/
│   ├── shared/
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
├── Hardware/
└── supabase/
    └── migrations/
```

## 4. Runtime flows หลัก

### 4.1 Auth และ profile bootstrap

1. ผู้ใช้ login ผ่าน Supabase Auth
2. `UserAuthContext.jsx` sync auth state และ expose `user`, `profile`, `logIn`, `signUp`, `logOut`, `refreshProfile`
3. `profileService.js` ดูแลการ upsert profile และ profile image bucket
4. ถ้าเป็น patient browser จะส่ง heartbeat ไป `patient_presence` เป็นระยะ

### 4.2 Device connection และ calibration

1. patient เข้า `/device-connection`
2. pair sensors ผ่าน Browser BLE
3. transport เก็บ device assignments ไว้ใน browser session
4. patient เข้า `/calibration`
5. transport emulate `CALIBRATE` และส่ง `CALIBRATION_START` หรือ `CALIBRATION_DONE`
6. route ถัดไป reuse stream เดิมได้โดยไม่ต้อง pair ใหม่ใน tab เดียวกัน

### 4.3 Therapy sessions และ games

1. patient เริ่ม `free_walk` หรือ game mode จาก patient app
2. transport broadcast `DATA` payloads จาก sensor ที่เชื่อมอยู่
3. `usePersistedGatewaySession.js` orchestrate session lifecycle และ summary payload
4. completed sessions ถูก queue ลง IndexedDB ผ่าน `sessionOutbox.js`
5. ถ้า online ระบบจะ sync ไป Supabase ทันที ถ้า offline จะ flush ตอน reconnect

### 4.4 Patient gait dashboard

1. route `/gait-dashboard` ใช้ runtime ใน `shared/gait-dashboard/`
2. local mode อ่าน stream ตรงจาก Browser BLE transport
3. analysis ใช้ worker-backed gait processor เพื่อให้ UI ลื่นขึ้น
4. ถ้าไม่มี sensor สามารถ fallback ไป demo mode ได้

### 4.5 Doctor live dashboard

1. doctor เปิด clinic app และเข้า patient detail
2. จากนั้นเปิด route `/clinic/live-gait/:patientId`
3. `PatientLiveGaitMirror.jsx` ที่ถูก mount ทั่ว patient app จะ publish stream ของ sensor หลักไปยัง Supabase Realtime Broadcast
4. `DoctorLiveGaitDashboard.jsx` subscribe stream ผ่าน `liveGaitBroadcast.js`
5. doctor dashboard วิเคราะห์และ render กราฟจาก stream ที่ mirror มา ไม่ได้อ่านจากตาราง database แบบ frame ต่อ frame

### 4.6 Clinic review flow

1. clinic app enforce doctor role ผ่าน `profile.role`
2. doctor dashboard อ่าน patient ที่ assign ผ่าน `doctor_patient_assignments`
3. doctor เปิด patient detail เพื่อดู sessions ย้อนหลัง
4. doctor เปิด analysis review ราย session เพื่อดู summary และ update review state

## 5. สิ่งที่ persist และสิ่งที่เป็น transient

### Persist ลง Supabase

- `profiles`
- `doctor_patient_assignments`
- `patient_presence`
- `sessions`
- `gait_metrics` สำหรับ `free_walk`
- `sessions.details` สำหรับ game-specific summaries

### ไม่ persist เป็นแถว realtime 100 Hz

- raw IMU packets
- Browser BLE `DATA` events ทุก frame
- doctor live chart batches ที่ส่งผ่าน Broadcast
- calibration timer state และ live chart UI state

## 6. Operational constraints ที่ควรรู้

- live sensor mode ต้องใช้ browser และ device ที่รองรับ Web Bluetooth จริง
- doctor live dashboard ขึ้นกับ Supabase Realtime quotas เพิ่มจาก baseline ของ auth และ history queries
- PWA และ service worker ช่วยเรื่อง app shell และ offline reopen แต่ไม่ได้ทำให้ sensor stream ทำงานได้โดยไม่รองรับ Web Bluetooth
- เอกสารนี้อธิบาย architecture ปัจจุบันเท่านั้น ถ้าต้องการ behavior ที่ละเอียดกว่าต้องดู implementation จริงใน `shared/` และ route entry files
