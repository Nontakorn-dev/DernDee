# DernDee Web App

อัปเดตตามโค้ดในโฟลเดอร์นี้ ณ 2026-05-05

`DernDee_Web-app/` คือ frontend หลักของโปรเจกต์ DernDee และรวม patient app, clinic app, Browser BLE transport, shared gait runtime, PWA support, และ Supabase integration ไว้ใน workspace เดียว

## โครงสร้างแอปปัจจุบัน

- HTML entry จริงมี 2 ตัว
  - `apps/patient/index.html`
  - `apps/clinic/index.html`
- patient gait dashboard อยู่ที่ route `/gait-dashboard` ภายใน patient app
- doctor live dashboard อยู่ที่ route `/clinic/live-gait/:patientId` ภายใน clinic app
- shared modules อยู่ใน `shared/`

## Stack ปัจจุบัน

- React 18
- Vite 4
- React Router 6
- Supabase JS client
- Browser BLE ผ่าน `shared/gateway/realtimeTransport.js`
- Chart.js และ shared dashboard runtime ใน `shared/gait-dashboard/`
- PWA ผ่าน `vite-plugin-pwa`

## Prerequisites

- Node.js 18 หรือใหม่กว่า
- npm
- Supabase project ที่ apply migrations แล้ว
- browser ที่รองรับ Web Bluetooth สำหรับ live sensor mode

## Setup

1. ติดตั้ง dependencies

```bash
cd DernDee_Web-app
npm install
```

2. สร้าง `.env` แล้วตั้งค่าอย่างน้อย

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

3. รัน dev server

```bash
npm run dev
```

dev server ปัจจุบันรันที่ `http://localhost:5174`

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | start Vite dev server |
| `npm run build` | build production assets |
| `npm run lint` | lint `shared` และ `apps` |
| `npm run preview` | preview build output |

## Routes สำคัญ

### Patient app

- `/` และ `/login`
- `/register`
- `/home`
- `/therapy`
- `/device-connection`
- `/calibration`
- `/walk-session`
- `/walk-summary`
- `/history`
- `/analysis-result` (redirects to `/walk-summary`)
- `/gait-dashboard`
- `/game/clearance`
- `/game/balance`
- `/game/rhythm`

### Clinic app

- `/clinic`
- `/clinic/chat`
- `/clinic/patients/:patientId`
- `/clinic/patients/:patientId/analysis/:sessionId`
- `/clinic/live-gait/:patientId`

## Shared modules ที่สำคัญ

| Path | Responsibility |
| --- | --- |
| `shared/supabase/client.js` | สร้าง Supabase browser client และ auth redirect utilities |
| `shared/context/UserAuthContext.jsx` | auth state, profile state, และ patient presence hooks |
| `shared/gateway/realtimeTransport.js` | Browser BLE pairing, packet decoding, และ in-browser transport |
| `shared/services/sessionService.js` | query และ persist sessions กับ Supabase |
| `shared/services/sessionOutbox.js` | IndexedDB outbox สำหรับ offline-first sessions |
| `shared/services/liveGaitBroadcast.js` | live stream relay ระหว่าง patient และ doctor ผ่าน Supabase Realtime |
| `shared/gait/` | gait processing, event detection, estimators |
| `shared/gait-dashboard/` | dashboard runtime, charts, UI styles |
| `shared/pwa/` | service worker และ PWA registration |

## Live sensor workflow

1. patient เปิด app และ login
2. ไปที่ `/device-connection`
3. pair sensors ผ่านปุ่ม Browser BLE
4. ไปที่ `/calibration` เพื่อเตรียม session
5. เริ่ม `free_walk` หรือ game mode
6. patient gait dashboard ใช้ stream ตรงจาก Browser BLE
7. ถ้ามี doctor viewer, `PatientLiveGaitMirror` จะ mirror stream ไป Supabase Realtime ให้ route `/clinic/live-gait/:patientId`

## Firmware note

- decoder ปัจจุบันใน frontend ตรงกับ `../Hardware/esp32_IMU_Ver2.ino` และ `../Hardware/esp32_ICM20948_Ver2.ino`

## Deployment notes

ถ้า deploy บน Vercel ให้ตั้งค่า

- Root Directory: `DernDee_Web-app`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

env ที่ควรตั้งบน deployment target

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_AUTH_REDIRECT_URL` ถ้าต้องการ explicit redirect URL

## Known caveats

- live sensor mode ต้องใช้ Web Bluetooth จริง
- doctor live dashboard ใช้ Realtime Broadcast จึงมีผลต่อ Supabase Realtime quota
- PWA cache อาจทำให้เห็น build เก่าหลัง deploy จนกว่าจะ refresh service worker
- package name `react-firebase-auth` ใน `package.json` เป็นชื่อเดิมที่ยังไม่ได้ rename แต่ไม่ได้สะท้อน stack ปัจจุบัน
