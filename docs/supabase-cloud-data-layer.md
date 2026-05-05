# Supabase Cloud Data Layer

อัปเดตตามโค้ดใน repository นี้ ณ 2026-05-05

## 1. บทบาทของ Supabase ในระบบปัจจุบัน

Supabase เป็น data layer กลางสำหรับ

- authentication
- profiles และ profile images
- patient presence
- session history
- gait metrics ของ `free_walk`
- doctor-patient assignment
- doctor review workflow
- live relay สำหรับ doctor dashboard ผ่าน Realtime Broadcast และ Presence

หลักการสำคัญตอนนี้คือ frontend เป็นเจ้าของ session lifecycle และ persistence orchestration เอง ส่วน Supabase เป็น source of record สำหรับข้อมูลย้อนหลังและ access control

## 2. Frontend client และ environment variables

client หลักอยู่ที่ `DernDee_Web-app/shared/supabase/client.js`

ตัวแปรที่จำเป็น

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

ตัวแปรที่ใช้ในบาง flow

- `VITE_SUPABASE_PROFILE_BUCKET`
- `VITE_SUPABASE_AUTH_REDIRECT_URL`
- `VITE_SUPABASE_SKIP_EMAIL_CONFIRMATION`
- `SUPABASE_SERVICE_ROLE_KEY` สำหรับ local dev signup helper ใน Vite middleware เท่านั้น

## 3. ตารางหลักที่ใช้งานจริง

- `profiles`
- `doctor_patient_assignments`
- `patient_presence`
- `sessions`
- `gait_metrics`

### `profiles`

เก็บข้อมูลผู้ใช้ เช่น

- `id`
- `email`
- `full_name`
- `avatar_url`
- `role`
- profile fields อื่นที่ใช้ในหน้าผู้ใช้

### `doctor_patient_assignments`

เก็บความสัมพันธ์ doctor กับ patient ที่ใช้จำกัดสิทธิ์การอ่านใน clinic app

### `patient_presence`

เก็บ online state ของ patient และถูก update จาก browser heartbeat

### `sessions`

เก็บข้อมูลระดับ session เช่น

- `patient_id`
- `gateway_session_id`
- `source`
- `session_type`
- `start_time`, `end_time`, `duration_seconds`
- `total_steps`
- `avg_speed_mps`, `cadence_spm`
- `avg_step_length_m`, `avg_stride_length_m`, `avg_clearance_m`
- `symmetry_score`
- `status`, `review_notes`, `reviewed_by`, `reviewed_at`
- `details` สำหรับ game-specific summaries

### `gait_metrics`

เก็บข้อมูลต่อก้าวสำหรับ session type ที่เปิดการ persist รายก้าว เช่น `free_walk`

ฟิลด์สำคัญ

- `session_id`
- `recorded_at`
- `side`
- `step_index`
- `step_length_m`, `stride_length_m`
- `step_time_s`, `swing_time_s`, `stance_time_s`, `stride_time_s`
- `max_clearance_m`, `speed_mps`, `symmetry_percent`
- `push_off_velocity_mps`, `touchdown_pitch_deg`
- `raw_payload`

## 4. สิ่งที่ไม่ถูกเก็บเป็น row realtime

Supabase tables ไม่ได้เก็บสิ่งต่อไปนี้แบบ 100 Hz

- raw BLE packets
- Browser BLE `DATA` events ทุก frame
- doctor live dashboard sample batches

doctor live dashboard ใช้ Supabase Realtime Broadcast เป็น relay ชั่วคราว ไม่ได้ persist เป็น historical rows โดยตรง

## 5. Migration set ปัจจุบัน

### `20260430000100_initial_cloud_data_layer.sql`

สร้าง schema หลักและ infra เริ่มต้น

- tables หลักทั้งหมด
- profile bootstrap trigger จาก `auth.users`
- indexes ชุดแรก
- storage bucket สำหรับ profile images
- RLS policies ชุดแรก

### `20260430000200_enable_doctor_patient_linking.sql`

เพิ่มความพร้อมสำหรับ doctor workflow

- backfill profiles จาก auth users เดิม
- policy สำหรับ doctor-patient assignments

### `20260430000300_add_session_details.sql`

เพิ่ม `sessions.details jsonb` สำหรับ game-specific summaries

### `20260504000100_enable_patient_session_inserts.sql`

เพิ่ม policy ให้ patient insert ได้เฉพาะ sessions ของตัวเอง และ insert `gait_metrics` ได้เฉพาะ session ที่เป็นของตัวเอง

### `20260504000200_set_session_source_default_to_frontend.sql`

ตั้งค่า default ของ `sessions.source` เป็น `frontend`

## 6. Session model ตาม session type

### `free_walk`

- persist `sessions`
- persist `gait_metrics`
- เหมาะกับ review และ export เชิง gait รายก้าว

### `high_stepper`
### `magic_plate`
### `rhythm_drummer`

- persist `sessions`
- persist `sessions.details`
- ไม่ persist `gait_metrics`

เหตุผลคือ game sessions เน้น summary-level review มากกว่าข้อมูลรายก้าว และลดปริมาณ writes ลงชัดเจน

## 7. Frontend persistence path

ไฟล์สำคัญ

- `DernDee_Web-app/shared/services/sessionService.js`
- `DernDee_Web-app/shared/services/sessionOutbox.js`
- `DernDee_Web-app/shared/hooks/usePersistedGatewaySession.js`
- `DernDee_Web-app/shared/hooks/useOfflineSessionSync.js`

flow ปัจจุบัน

1. frontend สร้าง payload ของ completed session
2. queue ลง IndexedDB outbox ก่อน
3. ถ้า browser online จะ sync ไป Supabase ทันที
4. ถ้า offline จะรอจนกลับมา online แล้ว `useOfflineSessionSync()` flush queue

## 8. Realtime features ที่พึ่ง Supabase

นอกจาก query และ insert ปกติ ระบบยังใช้ Supabase Realtime สำหรับ

- Auth session handling ผ่าน Supabase JS client
- doctor live dashboard ผ่าน Broadcast และ Presence channels ใน `liveGaitBroadcast.js`

หมายเหตุ

- realtime messages จาก doctor live dashboard นับใน Realtime quota ของ Supabase
- doctor live stream ไม่ได้ใช้ Postgres Changes subscription เป็นหลัก

## 9. RLS model ระดับสูง

- patient อ่านหรือแก้ profile ของตัวเองได้
- patient insert session ของตัวเองได้ผ่าน frontend persistence path
- patient insert `gait_metrics` ได้เฉพาะ rows ที่ผูกกับ session ของตัวเอง
- doctor อ่านข้อมูลได้เฉพาะ patient ที่ถูก assign ผ่าน `doctor_patient_assignments`
- doctor update review fields ของ `sessions` ได้เฉพาะ patient ที่อยู่ในความรับผิดชอบ

## 10. Deployment checklist

1. apply migrations ใน `supabase/migrations/` ให้ครบถึง `20260504000200`
2. ตั้งค่า `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY`
3. ตั้ง auth redirect URLs ให้ตรงกับ origin ที่ deploy จริง
4. promote doctor users โดย update `profiles.role = 'doctor'`
5. สร้าง `doctor_patient_assignments` สำหรับคู่ที่ต้องใช้งาน clinic app
6. ทดสอบ patient login, history, doctor dashboard, และ live dashboard บน environment จริง

## 11. Operational notes

- `sessionService.js` มี fallback สำหรับ environment ที่ยังไม่มี `sessions.details`
- local signup helper ใน Vite server ถูกจำกัดให้ใช้เฉพาะ loopback requests
- profile image bucket default คือ `profile-images` ถ้าไม่ override ด้วย env
- patient presence ขึ้นกับ browser heartbeat และ auth state ใน frontend
