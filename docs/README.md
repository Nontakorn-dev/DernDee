# DernDee Documentation

อัปเดตตามโค้ดใน repository นี้ ณ วันที่ 2026-05-04

เอกสารชุดนี้เป็น source of truth สำหรับสถาปัตย์ปัจจุบัน หลังย้าย realtime transport ไป Browser BLE และถอด Python gateway ออกจาก repo

## เริ่มอ่านจากไฟล์ไหน

1. `system-overview.md`
   ภาพรวมทั้งระบบ, runtime flow ระดับสูง, และข้อจำกัดของ Browser BLE

2. `frontend-apps.md`
   โครงสร้าง patient app, clinic app, gait dashboard, shared hooks, และ route สำคัญ

3. `realtime-browser-ble.md`
   รายละเอียด realtime transport ปัจจุบัน, message contract, และ Browser BLE runbook

4. `supabase-cloud-data-layer.md`
   แบบข้อมูลบน Supabase, migration สำคัญ, และ path การ persist ที่ frontend รับผิดชอบเอง

## สรุปสถาปัตย์ปัจจุบัน

- `DernDee_Web-app` เป็น React + Vite multi-entry app ที่มี patient app, clinic app, และ gait dashboard อยู่ใน repo เดียวกัน
- realtime transport ใช้ Browser BLE ใน `shared/gateway/realtimeTransport.js` เป็นค่า default
- `Hardware` เก็บ firmware ฝั่ง ESP32/IMU หลายตัว โดย packet format ปัจจุบันอิง `Hardware/esp32_imu_node.ino`
- authentication, profile, history, clinic review, และ doctor-patient assignment อยู่บน Supabase
- Free Walk persist `sessions` และ `gait_metrics` จาก frontend โดยตรง
- High Stepper, Magic Plate, และ Rhythm Drummer persist `sessions` summary และ `sessions.details`

## แผนที่เอกสาร

| File | Scope |
| --- | --- |
| `system-overview.md` | ภาพรวมระบบ, runtime flow, โครงสร้าง repo, ข้อจำกัดหลัก |
| `frontend-apps.md` | โครงสร้าง frontend, route map, shared services, patient/clinic flows |
| `realtime-browser-ble.md` | Browser BLE transport, control messages, firmware notes, runbook |
| `supabase-cloud-data-layer.md` | schema, migrations, RLS, environment variables, deployment checklist |

## โฟลเดอร์สำคัญใน repo

| Path | Purpose |
| --- | --- |
| `DernDee_Web-app/` | frontend หลักทั้งหมด |
| `DernDee_Web-app/apps/patient/` | patient web app |
| `DernDee_Web-app/apps/clinic/` | doctor/clinic web app |
| `DernDee_Web-app/shared/gait-dashboard/` | shared dashboard runtime, UI helpers, styles, และ demo data |
| `DernDee_Web-app/shared/` | shared auth, Supabase services, assets, styles, hooks |
| `Hardware/` | firmware และ prototype code ฝั่ง ESP32/IMU |
| `supabase/migrations/` | migration scripts สำหรับ schema ปัจจุบัน |

## สถานะเอกสารเดิม

- `PROJECT_SUMMARY.md` ถูกถอดออก เพราะอธิบายระบบยุค Firebase และ route/data flow เดิมที่ไม่ตรงกับโค้ดปัจจุบัน
- ถ้าต้องการอ่านภาพรวมเร็ว ให้เริ่มที่ `system-overview.md`