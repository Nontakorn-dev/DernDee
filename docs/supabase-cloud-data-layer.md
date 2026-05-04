# Supabase Cloud Data Layer

อัปเดตตามโค้ดใน repository นี้ ณ วันที่ 2026-05-04

## Goal

Supabase เป็น data layer กลางของระบบสำหรับ:

- authentication
- profile data
- patient presence
- session history
- doctor review workflow
- doctor-patient assignment

หลักการสำคัญของโปรเจกต์นี้คือ:

- realtime transport อยู่ใน browser ผ่าน Browser BLE
- frontend เป็นเจ้าของ session lifecycle และ session persistence เอง
- Supabase เป็น source of truth สำหรับข้อมูลย้อนหลังและ doctor review

## Persistence path ปัจจุบัน

ระบบนี้ใช้ browser-side persistence เป็นหลัก

### Browser-side Supabase access

ใช้ `@supabase/supabase-js` สำหรับ:

- login / signup / OAuth
- profile reads and updates
- patient presence heartbeat
- history reads
- clinic dashboard and patient detail reads
- doctor review updates
- persist completed `sessions`
- persist `gait_metrics` รายก้าวสำหรับ `free_walk`
- persist `sessions.details` สำหรับ game-specific summaries

## Current schema

table หลักที่ใช้งานจริง:

- `profiles`
- `doctor_patient_assignments`
- `patient_presence`
- `sessions`
- `gait_metrics`

### `sessions`

เก็บข้อมูลระดับ session เช่น:

- `patient_id`
- `session_type`
- `gateway_session_id` สำหรับ compatibility กับ schema เดิม แม้ตอนนี้จะ generate จาก frontend
- `start_time`, `end_time`, `duration_seconds`
- `total_steps`
- `avg_speed_mps`, `cadence_spm`
- `avg_step_length_m`, `avg_stride_length_m`, `avg_clearance_m`
- `symmetry_score`
- `status`, `review_notes`, `reviewed_by`, `reviewed_at`
- `details` สำหรับ game-specific summary fields

### `gait_metrics`

เก็บข้อมูลต่อก้าวเมื่อ session type อนุญาต เช่น:

- `recorded_at`
- `side`
- `step_index`
- `step_length_m`, `stride_length_m`
- `step_time_s`, `swing_time_s`, `stance_time_s`, `stride_time_s`
- `max_clearance_m`, `speed_mps`, `symmetry_percent`
- `push_off_velocity_mps`, `touchdown_pitch_deg`

## Current migration set

### `20260430000100_initial_cloud_data_layer.sql`

สร้าง schema หลัก:

- `profiles`
- `doctor_patient_assignments`
- `patient_presence`
- `sessions`
- `gait_metrics`
- profile bootstrap trigger จาก `auth.users`
- storage bucket สำหรับ profile images
- RLS policies และ indexes ชุดแรก

### `20260430000200_enable_doctor_patient_linking.sql`

เพิ่มความพร้อมสำหรับ doctor workflow:

- backfill `profiles` จาก auth users เดิม
- policy สำหรับให้ doctor insert `doctor_patient_assignments`

### `20260430000300_add_session_details.sql`

เพิ่มคอลัมน์ `sessions.details jsonb` เพื่อเก็บข้อมูลเฉพาะเกม เช่น:

- High Stepper: red line hits, target reps, target height
- Magic Plate: center hold, time in zones, average deviation
- Rhythm Drummer: score, best streak, target BPM

## Session model by type

### `free_walk`

- persist `sessions`
- persist `gait_metrics`
- เหมาะกับ analysis เชิง gait รายก้าวและ CSV export

### `high_stepper`
### `magic_plate`
### `rhythm_drummer`

- persist `sessions`
- persist `sessions.details`
- ไม่ persist `gait_metrics`

เหตุผลคือ game sessions ต้องการ summary เพื่อ review ระดับ session มากกว่าข้อมูลรายก้าว และการตัด per-step rows ออกช่วยลด Supabase write volume ได้มาก

## RLS model

แนวคิดหลักของ RLS ปัจจุบัน:

- patient อ่านหรือแก้ข้อมูลตัวเองได้
- patient insert session ของตัวเองได้ผ่าน browser session persistence path
- doctor อ่านข้อมูลได้เฉพาะ patient ที่ถูก assign ผ่าน `doctor_patient_assignments`
- doctor update `sessions` ได้เฉพาะ row ของ patient ที่ตัวเองรับผิดชอบ
- `gait_metrics` select อิงจาก session ownership หรือ assignment ไม่ได้เปิด public

## Frontend integration points

ไฟล์สำคัญ:

- `DernDee_Web-app/shared/supabase/client.js`
- `DernDee_Web-app/shared/services/profileService.js`
- `DernDee_Web-app/shared/services/sessionService.js`
- `DernDee_Web-app/shared/hooks/usePersistedGatewaySession.js`
- `DernDee_Web-app/shared/context/UserAuthContext.jsx`

บทบาทของแต่ละชิ้น:

- `client.js` สร้าง browser Supabase client และ auth redirect utilities
- `profileService.js` จัดการ profile normalization, upsert, patient presence
- `sessionService.js` query history หรือ review และ insert session rows จาก frontend
- `usePersistedGatewaySession.js` orchestrate session lifecycle กับ realtime transport และเรียก `persistSessionFromFrontend()`
- `UserAuthContext.jsx` ถือ auth state กลางของ app ทั้ง patient และ clinic

## Environment files

### Frontend `.env`

จำเป็น:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

ใช้ในบาง flow:

- `VITE_SUPABASE_PROFILE_BUCKET`
- `VITE_SUPABASE_AUTH_REDIRECT_URL`
- `VITE_SUPABASE_SKIP_EMAIL_CONFIRMATION`
- `SUPABASE_SERVICE_ROLE_KEY` เฉพาะ local dev signup helper ใน Vite middleware

## Deployment checklist

1. Apply migrations ใน `supabase/migrations/` ให้ครบอย่างน้อย 001, 002, และ 003
2. กำหนด frontend env vars ให้ถูกต้อง
3. ตั้งค่า Supabase Auth redirect URLs ให้ตรงกับ deployment target
4. promote doctor users โดย update `profiles.role = 'doctor'`
5. สร้าง `doctor_patient_assignments` สำหรับคู่ doctor/patient ที่ต้องใช้งาน
6. deploy frontend บน origin ที่ใช้ browser และ device ที่รองรับ Web Bluetooth
7. ทดสอบ Browser BLE pairing, calibration, และ session persistence บน environment จริงก่อนเปิดใช้งาน

## Operational notes

- patient presence ถูก update จาก browser heartbeat ทุก 30 วินาที
- ถ้า `sessions.details` ยังไม่มีในฐานบาง environment, frontend query layer มี fallback ไป schema เก่า
- local signup bypass ถูกจำกัดให้ใช้เฉพาะ loopback request ใน dev server เท่านั้น