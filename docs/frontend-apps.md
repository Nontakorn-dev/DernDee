# Frontend Apps

อัปเดตตามโค้ดใน repository นี้ ณ วันที่ 2026-05-04

## 1. โครงสร้าง frontend ปัจจุบัน

frontend อยู่ใน `DernDee_Web-app/` และใช้ Vite multi-entry app แทนการแยกหลาย repo

entry points ปัจจุบัน:

- `apps/patient/index.html`
- `apps/clinic/index.html`

shared code อยู่ที่ `DernDee_Web-app/shared/`

## 2. Vite และ route aliasing

ไฟล์หลักคือ `DernDee_Web-app/vite.config.js`

สิ่งสำคัญที่ config นี้ทำ:

- map patient app เป็น root `/`
- map clinic app เป็น `/clinic`
- map gait dashboard หลักเป็น `/gait-dashboard`
- redirect path เก่า `/clinic/gait-dashboard` กลับเข้ามา route กลาง
- กันไม่ให้ Vite internal requests ถูก rewrite ผิด path
- มี local dev middleware สำหรับ Supabase signup bypass ในเครื่องเดียวกัน

alias หลัก:

- `@shared`
- `@patient`
- `@clinic`

## 3. Shared Layer

shared layer เป็นหัวใจของ frontend ปัจจุบัน เพราะทั้ง patient และ clinic ใช้ auth, transport, และ data model ชุดเดียวกัน

### 3.1 Auth และ profile

ไฟล์สำคัญ:

- `shared/supabase/client.js`
- `shared/context/UserAuthContext.jsx`
- `shared/services/profileService.js`
- `shared/auth/ProtectedRoute.jsx`

ความรับผิดชอบหลัก:

- bootstrap session จาก Supabase Auth
- sync row ใน `profiles`
- expose `user`, `profile`, `refreshProfile`, `logIn`, `signUp`, `logOut`
- heartbeat `patient_presence` ทุก 30 วินาทีเมื่อ patient online
- mark offline ตอน logout, unload, หรือ tab hidden

### 3.2 Realtime transport และ session data

ไฟล์สำคัญ:

- `shared/gateway/realtimeTransport.js`
- `shared/services/sessionService.js`
- `shared/services/sessionOutbox.js`
- `shared/hooks/usePersistedGatewaySession.js`
- `shared/hooks/useOfflineSessionSync.js`
- `shared/pwa/registerPwa.js`

หน้าที่หลัก:

- pair sensors ผ่าน Browser BLE
- decode Packet V1 และส่ง `DATA` payloads ไป routes ที่เปิด realtime connection
- emulate `CALIBRATE`, `RESET`, `START_SESSION`, `END_SESSION` ใน browser
- query history และ latest session ของ patient
- query dashboard, patient detail, และ analysis review ของ doctor
- map `session_type` ไปเป็น labels, descriptions, tones, และ card metrics
- persist `sessions` และ `gait_metrics` ลง IndexedDB outbox ก่อน แล้วค่อย sync ไป Supabase
- flush pending session queue เมื่อ browser online กลับมา
- register service worker และ web manifest สำหรับ installable offline shell

หมายเหตุ: hook ยังใช้ชื่อ `usePersistedGatewaySession.js` ตามชื่อเดิม แต่ path ปัจจุบันไม่ได้พึ่ง Python gateway แล้ว

## 4. Patient App

entry file: `apps/patient/src/main.jsx`

### Route map หลัก

| Route | Screen | Purpose |
| --- | --- | --- |
| `/login` | `Login.jsx` | email/password login |
| `/register` | `Register.jsx` | patient sign up |
| `/home` | `Home.jsx` | dashboard หลักของ patient |
| `/profile` | `Profile.jsx` | profile editing + patient ID display |
| `/settings` | `Settings.jsx` | settings UI |
| `/therapy` | `TherapySelect.jsx` | เลือก therapy mode |
| `/device-connection` | `DeviceConnection.jsx` | pair และดูสถานะ Browser BLE sensors |
| `/calibration` | `Calibration.jsx` | calibration ก่อนเริ่ม session |
| `/walk-session` | `WalkSession.jsx` | free walk realtime session |
| `/walk-summary` | `WalkSummary.jsx` | summary หลังจบ walk |
| `/history` | `History.jsx` | session history ของ patient |
| `/analysis-result` | `AnalysisResult.jsx` | latest session summary |
| `/telemedicine` | `Telemedicine.jsx` | telemedicine prototype |
| `/game/clearance` | `GameClearance.jsx` | High Stepper |
| `/game/balance` | `GameBalance.jsx` | Magic Plate |
| `/game/rhythm` | `GameRhythm.jsx` | Rhythm Drummer |

### Patient screens ที่เชื่อมระบบจริงแล้ว

- `Home.jsx`
  - progress card คำนวณจาก `sessions` ของวันนั้นจริง
- `History.jsx`
  - อ่านจาก Supabase และแยก card ตาม `session_type`
- `Profile.jsx`
  - profile image, editable profile, และ patient user ID
- `DeviceConnection.jsx`
  - pair sensor จริงผ่าน Browser BLE และเก็บ assignment ไว้ reuse ข้าม route
- `WalkSession.jsx`
  - realtime Browser BLE + offline-first session persistence

### Patient screens ที่ยังเป็น prototype บางส่วน

- `Telemedicine.jsx`
  - ยังเป็น UI/prototype มากกว่า backend-integrated telehealth flow
- `AnalysisResult.jsx`
  - ยังใช้ presentation แบบ generic summary มากกว่าแยกตาม session type เต็มรูปแบบ

## 5. Gamification บน frontend

### High Stepper

- file: `apps/patient/src/components/games/GameClearance.jsx`
- รับ realtime state จาก Browser BLE transport
- persist session type `high_stepper`
- ใส่ `details` เช่น `red_line_hits`, `target_reps`, `target_height_cm`, `goal_progress_percent`, `stability_score`

### Magic Plate

- file: `apps/patient/src/components/games/GameBalance.jsx`
- ใช้ quaternion หรือ tilt สำหรับ balance training
- persist session type `magic_plate`
- ใส่ `details` เช่น time in zones, center hold %, avg deviation

### Rhythm Drummer

- file: `apps/patient/src/components/games/GameRhythm.jsx`
- ใช้ beat timing, cadence, score, streak
- gait analysis path ใช้ worker-backed `GaitProcessor`
- persist session type `rhythm_drummer`
- ใส่ `details` เช่น score, target score, best streak, target BPM, beat count

## 6. Clinic App

entry file: `apps/clinic/src/main.jsx`

clinic app ใช้ `basename = '/clinic'` และมี doctor role guard ที่ตรวจทั้ง auth state และ `profile.role`

### Route map หลัก

| Route | Screen | Purpose |
| --- | --- | --- |
| `/clinic/` | `DoctorDashboard.jsx` | ภาพรวม patient ที่ assign กับ doctor |
| `/clinic/chat` | `DoctorChat.jsx` | chat UI / workflow prototype |
| `/clinic/patients/:patientId` | `DoctorPatientDetail.jsx` | ข้อมูลผู้ป่วย + sessions list |
| `/clinic/patients/:patientId/analysis/:sessionId` | `DoctorAnalysisReview.jsx` | review ราย session |

### จุดเชื่อมกับ Supabase ที่สำคัญ

- dashboard query ผ่าน `fetchDoctorDashboardData`
- add patient by user ID ผ่าน `addDoctorPatientAssignment`
- patient detail และ review อ่านจาก `sessions`, `profiles`, `gait_metrics`
- game session cards ใช้ `sessions.details` เพื่อ render metric ที่ต่างกันตาม mode

## 7. Gait Dashboard

dashboard logic และ styles กลางอยู่ที่ `DernDee_Web-app/shared/gait-dashboard/`

ตอนนี้ dashboard หลักถูกเปิดผ่าน patient route `/gait-dashboard` โดย `apps/patient/src/components/GaitDashboard.jsx`

หน้าที่หลัก:

- แสดง signal-level view ของ raw และ processed gait data
- ใช้ realtime transport เดียวกับ patient app
- สามารถ reuse Browser BLE connection เดิมได้ถ้า sensor ยังเชื่อมอยู่ใน session เดียวกัน
- analysis หลักใช้ worker-backed `GaitProcessor`
- fallback เป็น demo mode เมื่อไม่มี sensor ที่ pair ไว้หรือ browser ไม่รองรับ Web Bluetooth

## 8. Frontend data presentation model

session cards ปัจจุบันไม่ได้ render field ดิบจาก database ตรง ๆ ทุกจุด แต่ใช้ model กลางจาก `sessionService.js`

สิ่งที่ model นี้ทำ:

- map `session_type` ไปเป็น display label เช่น Free Walk, High Stepper, Magic Plate, Rhythm Drummer
- map `details` ไปเป็น card metrics ที่อ่านง่าย
- ใช้ tone หรือ color ต่างกันตาม session type ทั้งฝั่ง patient history และ clinic patient detail

## 9. Frontend environment variables

### Frontend `.env`

จำเป็น:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

ใช้ในบาง flow:

- `VITE_SUPABASE_PROFILE_BUCKET`
- `VITE_SUPABASE_AUTH_REDIRECT_URL`
- `VITE_SUPABASE_SKIP_EMAIL_CONFIRMATION`
- `SUPABASE_SERVICE_ROLE_KEY` เฉพาะ local dev signup helper ใน Vite server

## 10. Known caveats ฝั่ง frontend

- clinic review page ยังใช้ layout แบบ generic gait parameters แม้ game sessions จะเป็น summary-only model แล้ว
- export CSV สำหรับ game sessions อาจไม่มี per-step rows ถ้า session type เป็น summary-only
- live sensor mode ต้องใช้ browser ที่รองรับ Web Bluetooth จริง