# DernDee

![DernDee logo](DernDee_Web-app/shared/assets/images/derndee-logo.png)

อัปเดตตามโครงสร้าง repository ปัจจุบัน ณ 2026-05-05

DernDee เป็น prototype ระบบฟื้นฟูการเดินแบบ realtime ที่เชื่อม firmware IMU, Browser BLE ในฝั่งเว็บ, patient และ clinic web apps, และ Supabase data layer เข้าด้วยกันใน repo เดียว

ถ้าเอกสารกับโค้ดขัดกัน ให้ยึดโค้ดใน repo เป็นหลัก

## ภาพรวมปัจจุบัน

- frontend หลักอยู่ใน `DernDee_Web-app/`
- Vite build มี HTML entry จริง 2 ตัวคือ patient app และ clinic app
- gait dashboard หลักเป็น route ใน patient app ที่ `/gait-dashboard`
- doctor live dashboard เป็น route ใน clinic app ที่ `/clinic/live-gait/:patientId`
- realtime sensor ingestion ใช้ Browser BLE ผ่าน `DernDee_Web-app/shared/gateway/realtimeTransport.js`
- patient live mirror ส่ง stream ไปให้ doctor ผ่าน Supabase Realtime Broadcast ใน `DernDee_Web-app/shared/services/liveGaitBroadcast.js`
- session persistence เป็น offline-first: queue ลง IndexedDB ก่อน แล้วค่อย sync ไป Supabase

## โครงสร้าง repo

```text
DernDee_Robustness/
├── README.md
├── DernDee_Web-app/
│   ├── README.md
│   ├── apps/
│   │   ├── patient/
│   │   └── clinic/
│   ├── public/
│   ├── shared/
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
├── docs/
│   ├── README.md
│   ├── system-overview.md
│   ├── frontend-apps.md
│   ├── realtime-browser-ble.md
│   └── supabase-cloud-data-layer.md
├── Hardware/
│   ├── esp32_ICM20948_Ver2.ino
│   ├── esp32_IMU_Ver2.ino
│   └── esp32_imu_node.ino
└── supabase/
    └── migrations/
```

## พื้นผิวหลักของระบบ

| Surface | Path | Role |
| --- | --- | --- |
| Patient app | `/` และ `/login` | auth entry และหน้าใช้งานฝั่ง patient |
| Therapy flow | `/therapy`, `/device-connection`, `/calibration`, `/walk-session` | pair sensor, calibration, และเริ่ม session |
| Games | `/game/clearance`, `/game/balance`, `/game/rhythm` | High Stepper, Magic Plate, Rhythm Drummer |
| Patient gait dashboard | `/gait-dashboard` | dashboard ฝั่ง patient ที่ใช้ stream ตรงจาก Browser BLE |
| Clinic app | `/clinic` | doctor dashboard และรายการ patient |
| Doctor live dashboard | `/clinic/live-gait/:patientId` | dashboard ฝั่ง doctor ที่รับ stream ผ่าน Supabase Realtime |

## Quick Start

1. ติดตั้ง dependencies

```bash
cd DernDee_Web-app
npm install
```

2. สร้างไฟล์ `.env` ใน `DernDee_Web-app/` แล้วตั้งค่าอย่างน้อย

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

3. รัน dev server

```bash
npm run dev
```

4. เปิดใช้งาน

- patient app: `http://localhost:5174/`
- clinic app: `http://localhost:5174/clinic`
- patient gait dashboard: `http://localhost:5174/gait-dashboard`

## Firmware ที่รองรับกับ decoder ปัจจุบัน

- `Hardware/esp32_IMU_Ver2.ino` ตรงกับ decoder ปัจจุบันใน `realtimeTransport.js`
- packet ที่รองรับตอนนี้เป็น Packet V1 ขนาด 22 bytes พร้อม magic `0xAA55`, sequence, timestamp, raw accel, raw gyro, และ CRC8
- `Hardware/esp32_imu_node.ino` ใช้ packet layout และ checksum คนละแบบ จึงควรมองเป็น reference หรือ prototype ไม่ใช่ firmware หลักของ frontend ปัจจุบัน

## การ deploy ปัจจุบัน

ถ้า deploy ด้วย Vercel ให้ตั้งค่าแบบนี้

- Root Directory: `DernDee_Web-app`
- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

ตัวแปรแวดล้อมที่ต้องมีบน deployment target อย่างน้อย

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_AUTH_REDIRECT_URL` ถ้าต้องการ redirect URL แบบ explicit

หมายเหตุ: โปรเจกต์นี้เปิดใช้ PWA และ service worker ดังนั้นหลัง deploy อาจต้อง hard refresh หรือเคลียร์ service worker ถ้าเห็น asset เก่า

## แผนที่เอกสาร

- `docs/README.md` ภาพรวมเอกสารทั้งหมด
- `docs/system-overview.md` สถาปัตย์ระดับระบบ
- `docs/frontend-apps.md` routes, app boundaries, shared layer
- `docs/realtime-browser-ble.md` Browser BLE runtime และ doctor live broadcast flow
- `docs/supabase-cloud-data-layer.md` schema, migrations, RLS, และ deployment checklist
- `DernDee_Web-app/README.md` setup, scripts, และ deployment notes ของ frontend package

## สรุปการเก็บข้อมูล

- `profiles`, `doctor_patient_assignments`, `patient_presence`, `sessions`, และ `gait_metrics` อยู่บน Supabase
- `free_walk` เก็บทั้ง `sessions` และ `gait_metrics`
- `high_stepper`, `magic_plate`, และ `rhythm_drummer` เก็บ `sessions` และ `sessions.details` แบบ summary-only
- raw IMU packets และ doctor live batches ไม่ถูกเก็บเป็นแถว 100 Hz ในฐานข้อมูล
