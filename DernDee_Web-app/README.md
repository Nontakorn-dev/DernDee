# DernDee Web App

DernDee_Web-app เป็น frontend หลักของระบบ DernDee ที่รวม patient app, clinic app, shared gait dashboard, Browser BLE realtime transport, และ Supabase integration ไว้ใน workspace เดียวกัน

## Stack ปัจจุบัน

- Frontend: React + Vite
- Auth และ data layer: Supabase
- Realtime transport: Browser BLE ผ่าน `shared/gateway/realtimeTransport.js`
- Shared gait logic: JavaScript modules ใน `shared/gait/`

## Prerequisites

- Node.js 18 หรือใหม่กว่า
- npm
- Supabase project
- browser ที่รองรับ Web Bluetooth สำหรับ live sensor mode

## Setup

1. ติดตั้ง dependencies

```bash
cd DernDee_Web-app
npm install
```

2. ตั้งค่า environment variables

- คัดลอก `.env.example` เป็น `.env`
- ใส่ค่า `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY`
- ถ้าใช้ local signup helper ให้เติม `SUPABASE_SERVICE_ROLE_KEY` ตามที่ `vite.config.js` รองรับใน dev เท่านั้น

3. รัน dev server

```bash
npm run dev
```

## Routes สำคัญ

- Patient app: `http://localhost:5174`
- Clinic app: `http://localhost:5174/clinic/`
- Gait dashboard: `http://localhost:5174/gait-dashboard`

## Live sensor workflow

1. เปิด patient app
2. เข้า `Device Connection`
3. pair sensors ผ่านปุ่ม `Connect via BLE`
4. ไป `Calibration` และเริ่ม session ได้เลย
5. Free Walk, เกม, และ gait dashboard จะใช้ stream เดียวกันจาก Browser BLE transport

## โครงสร้างหลัก

```text
apps/
├── patient/
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       └── components/
└── clinic/
    ├── index.html
    └── src/
        ├── main.jsx
        ├── components/
        └── data/

shared/
├── assets/
├── auth/
├── context/
├── gait/
├── gait-dashboard/
├── gateway/
├── hooks/
├── sensor/
├── services/
└── supabase/
```

## หมายเหตุ

- realtime mode ไม่ต้องพึ่ง Python gateway แล้ว
- session persistence เกิดจาก frontend โดยตรงผ่าน `shared/services/sessionService.js`
- ถ้า browser ไม่รองรับ Web Bluetooth, gait dashboard ยังใช้ demo mode ได้ แต่ session จริงจาก sensor จะไม่ทำงาน
