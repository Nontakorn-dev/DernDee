# DernDee Documentation

อัปเดตตามโค้ดใน repository นี้ ณ 2026-06-11

เอกสารชุดนี้ตั้งใจให้อธิบายระบบตาม repo ปัจจุบัน แต่ถ้าเอกสารกับ implementation ขัดกัน ให้ยึดโค้ดเป็นหลัก

## แนะนำลำดับการอ่าน

1. `system-overview.md`
   ภาพรวมระบบ, runtime flow, ขอบเขตของข้อมูลที่ persist และสิ่งที่เป็น transient

2. `frontend-apps.md`
   route map ของ patient และ clinic apps, shared layer, และ app boundaries ที่ใช้จริง

3. `realtime-browser-ble.md`
   Browser BLE transport, packet contract, device pairing, และ live broadcast จาก patient ไป doctor

4. `supabase-cloud-data-layer.md`
   schema, migrations, RLS, environment variables, และ deployment checklist

5. `sota-stroke-gait-analysis-prd.md`
   เอกสารเป้าหมายผลิตภัณฑ์สำหรับยกระดับระบบไปสู่ stroke gait analysis แบบ SOTA โดยอิงจาก baseline ของ repo ปัจจุบัน

## เอกสารที่ถูกดูแลใน repo ตอนนี้

| File | Scope |
| --- | --- |
| `README.md` | entry point ระดับ repo, quick start, deployment snapshot |
| `DernDee_Web-app/README.md` | setup, scripts, routes, และ deploy notes ของ frontend package |
| `docs/system-overview.md` | ภาพรวมสถาปัตย์และ runtime flows |
| `docs/frontend-apps.md` | patient app, clinic app, shared modules, และ routes |
| `docs/realtime-browser-ble.md` | Browser BLE runtime และ doctor live broadcast flow |
| `docs/supabase-cloud-data-layer.md` | Supabase schema, migrations, RLS, outbox, และ operational notes |
| `docs/current-gait-detection-and-integration.md` | อธิบาย algorithm ที่รันอยู่จริงใน gait runtime ปัจจุบัน |
| `docs/sota-stroke-gait-analysis-prd.md` | PRD สำหรับ target product direction, performance goals, gaps, และ roadmap ของ stroke gait analysis |

## สรุปสถาปัตย์ปัจจุบัน

- `DernDee_Web-app/` เป็น React + Vite workspace เดียวที่ build เป็น 2 HTML entries คือ patient และ clinic
- `gait-dashboard` ไม่ได้เป็น HTML entry แยก แต่เป็น route `/gait-dashboard` ภายใน patient app
- doctor live dashboard อยู่ที่ `/clinic/live-gait/:patientId` และใช้ Supabase Realtime Broadcast แทนการ polling database
- realtime sensor path หลักใช้ Browser BLE ใน `shared/gateway/realtimeTransport.js`
- patient app mount `PatientLiveGaitMirror` แบบ global เพื่อสะท้อน live stream ไป doctor เมื่อมี viewer
- firmware ที่ตรงกับ decoder ปัจจุบันคือ `Hardware/esp32_IMU_Ver2.ino`
- migrations ที่ใช้งานตอนนี้มีตั้งแต่ `20260430000100` ถึง `20260504000200`

## หมายเหตุการบำรุงรักษา

- หลีกเลี่ยงการคัดลอก tree หรือ route เกินจำเป็น ถ้าไม่จำเป็น เพราะ drift ง่าย
- เมื่อแก้ route, Supabase schema, หรือ packet format ให้ปรับ docs ชุดนี้พร้อมกัน
- ถ้ามีข้อสงสัยเรื่อง behavior ล่าสุด ให้ดู `apps/patient/src/main.jsx`, `apps/clinic/src/main.jsx`, `shared/gateway/realtimeTransport.js`, และ `shared/services/sessionService.js`
