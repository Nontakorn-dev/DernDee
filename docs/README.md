# DernDee Documentation

อัปเดตตามโค้ดใน repository นี้ ณ วันที่ 2026-05-01

เอกสารชุดนี้เป็น source of truth สำหรับสถานะระบบปัจจุบัน แทนไฟล์ `PROJECT_SUMMARY.md` เดิมที่อิงสถาปัตย์เก่า

## เริ่มอ่านจากไฟล์ไหน

1. `system-overview.md`
   ภาพรวมทั้งระบบ, องค์ประกอบหลัก, data flow ระดับสูง, และข้อจำกัดการใช้งานจริง

2. `frontend-apps.md`
   โครงสร้างเว็บแอปฝั่ง patient, clinic, shared layer, และหน้าที่ของ route หลัก

3. `realtime-gateway.md`
   รายละเอียด Python gateway, BLE ingestion, WebSocket contract, firmware compatibility, และ persistence policy

4. `supabase-cloud-data-layer.md`
   แบบข้อมูลบน Supabase, migration สำคัญ, RLS model, และเส้นทาง persistence ระหว่าง frontend กับ gateway

## สรุปสถาปัตย์ปัจจุบัน

- `DernDee_Web-app` เป็น React + Vite multi-entry app ที่มี patient app, clinic app, และ gait dashboard อยู่ใน repo เดียวกัน
- `gateway_v2` เป็น Python realtime gateway สำหรับรับ BLE IMU, ประมวลผล gait, และ broadcast ผ่าน WebSocket ที่พอร์ต `8765`
- `Hardware` เก็บ firmware ฝั่ง ESP32/IMU หลายตัว แต่ gateway ปัจจุบัน decode packet format ที่ตรงกับ `Hardware/esp32_imu_node.ino`
- authentication, profile, history, clinic review, และ doctor-patient assignment ย้ายมาอยู่บน Supabase แล้ว
- Free Walk จะ persist `sessions` และ `gait_metrics` รายก้าว
- High Stepper, Magic Plate, และ Rhythm Drummer จะ persist เฉพาะ `sessions` summary และ `sessions.details` เพื่อคุม Supabase write volume

## แผนที่เอกสาร

| File | Scope |
| --- | --- |
| `system-overview.md` | ภาพรวมระบบ, runtime flow, โครงสร้าง repo, ข้อจำกัดหลัก |
| `frontend-apps.md` | โครงสร้าง frontend, route map, shared services, patient/clinic flows |
| `realtime-gateway.md` | gateway internals, WebSocket messages, persistence rules, firmware notes |
| `supabase-cloud-data-layer.md` | schema, migrations, RLS, environment variables, deployment checklist |

## โฟลเดอร์สำคัญใน repo

| Path | Purpose |
| --- | --- |
| `DernDee_Web-app/` | frontend หลักทั้งหมด |
| `DernDee_Web-app/apps/patient/` | patient web app |
| `DernDee_Web-app/apps/clinic/` | doctor/clinic web app |
| `DernDee_Web-app/apps/clinic/gait-dashboard/` | dashboard สำหรับดูสัญญาณและ metrics แบบ live |
| `DernDee_Web-app/shared/` | shared auth, Supabase services, assets, styles, hooks |
| `gateway_v2/` | BLE/WebSocket gateway และ session persistence |
| `Hardware/` | firmware และ prototype code ฝั่ง ESP32/IMU |
| `supabase/migrations/` | migration scripts สำหรับ schema ปัจจุบัน |

## สถานะเอกสารเดิม

- `PROJECT_SUMMARY.md` ถูกถอดออก เพราะอธิบายระบบยุค Firebase และ route/data flow เดิมที่ไม่ตรงกับโค้ดปัจจุบัน
- ถ้าต้องการอ่านภาพรวมเร็ว ให้เริ่มที่ `system-overview.md`