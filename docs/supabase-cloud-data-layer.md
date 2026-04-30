# Supabase Cloud Data Layer

อัปเดตตามโค้ดใน repository นี้ ณ วันที่ 2026-05-01

## Goal

Supabase เป็น data layer กลางของระบบสำหรับ:

- authentication
- profile data
- patient presence
- session history
- doctor review workflow
- doctor-patient assignment

หลักการสำคัญของโปรเจกต์นี้คือ:

- browser ไม่ใช่ source of truth สำหรับ gait persistence
- `gateway_v2` เป็น service เดียวที่รู้ว่ามี gait events จริงเกิดขึ้นเมื่อไร
- frontend มีหน้าที่ส่ง session lifecycle commands และอ่านผลที่ถูก persist แล้วกลับมาแสดง

## Persistence split ปัจจุบัน

ระบบนี้ใช้ 2 เส้นทาง persistence พร้อมกัน:

### 1. Browser-side Supabase access

ใช้ `@supabase/supabase-js` สำหรับ:

- login / signup / OAuth
- profile reads and updates
- patient presence heartbeat
- history reads
- clinic dashboard and patient detail reads
- doctor review updates

### 2. Gateway-side Supabase access

ใช้ service role key ใน `gateway_v2` สำหรับ:

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

- patient อ่าน/แก้ข้อมูลตัวเองได้
- doctor อ่านข้อมูลได้เฉพาะ patient ที่ถูก assign ผ่าน `doctor_patient_assignments`
- doctor update `sessions` ได้เฉพาะ row ของ patient ที่ตัวเองรับผิดชอบ
- `gait_metrics` select อิงจาก session ownership/assignment ไม่ได้เปิด public

## Frontend integration points

ไฟล์สำคัญ:

- `DernDee_Web-app/shared/supabase/client.js`
- `DernDee_Web-app/shared/services/profileService.js`
- `DernDee_Web-app/shared/services/sessionService.js`
- `DernDee_Web-app/shared/context/UserAuthContext.jsx`

บทบาทของแต่ละชิ้น:

- `client.js` สร้าง browser Supabase client และ auth redirect utilities
- `profileService.js` จัดการ profile normalization, upsert, patient presence
- `sessionService.js` query history/dashboard/review และ map session rows เป็น UI-friendly model
- `UserAuthContext.jsx` ถือ auth state กลางของ app ทั้ง patient และ clinic

## Gateway integration points

ไฟล์สำคัญ:

- `gateway_v2/main.py`
- `gateway_v2/session_persistence.py`

flow ปัจจุบัน:

1. frontend ส่ง `START_SESSION`
2. gateway เปิด active session in memory
3. gateway broadcast realtime `DATA`
4. frontend ส่ง `END_SESSION` พร้อม `summary` และ `details`
5. gateway persist `sessions`
6. gateway persist `gait_metrics` เฉพาะ session types ที่อนุญาต

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

### Gateway `.env`

จำเป็น:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deployment checklist

1. Apply migrations ใน `supabase/migrations/` ให้ครบอย่างน้อย 001, 002, และ 003
2. กำหนด frontend env vars ให้ถูกต้อง
3. กำหนด gateway env vars ให้ถูกต้อง และเก็บ service role ไว้เฉพาะ gateway
4. ตั้งค่า Supabase Auth redirect URLs ให้ตรงกับ deployment target
5. promote doctor users โดย update `profiles.role = 'doctor'`
6. สร้าง `doctor_patient_assignments` สำหรับคู่ doctor/patient ที่ต้องใช้งาน
7. รัน frontend และ gateway พร้อมกันเพื่อให้ session write path สมบูรณ์

## Operational notes

- patient presence ถูก update จาก browser heartbeat ทุก 30 วินาที
- ถ้า `sessions.details` ยังไม่มีในฐานบาง environment, frontend query layer มี fallback ไป schema เก่า
- local signup bypass ถูกจำกัดให้ใช้เฉพาะ loopback request ใน dev server เท่านั้น