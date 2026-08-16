# Frontend Apps

อัปเดตตามโค้ดใน repository นี้ ณ 2026-05-05

## 1. โครงสร้าง frontend ปัจจุบัน

frontend ทั้งหมดอยู่ใน `DernDee_Web-app/` และใช้ Vite workspace เดียว

HTML entries ที่ build จริงมี 2 ตัว

- `apps/patient/index.html`
- `apps/clinic/index.html`

shared code อยู่ที่ `DernDee_Web-app/shared/`

## 2. Vite และ route handling

ไฟล์หลักคือ `DernDee_Web-app/vite.config.js`

สิ่งสำคัญที่ config นี้ทำอยู่ตอนนี้

- alias `@shared` ไป `shared/`
- alias `@patient` ไป `apps/patient/src/`
- alias `@clinic` ไป `apps/clinic/src/`
- serve patient app ที่ `/`
- serve clinic app ที่ `/clinic`
- rewrite `/clinic/gait-dashboard` กลับไป patient route `/gait-dashboard` เพื่อ compatibility
- copy build output ไปที่ `dist/index.html` และ `dist/clinic/index.html`
- register PWA ผ่าน `vite-plugin-pwa`
- รัน local signup helper เฉพาะ loopback requests ถ้าเปิด env สำหรับ dev mode

dev server ปัจจุบันรันที่ `http://localhost:5174`

## 3. Shared layer ที่ใช้จริง

### 3.1 Auth และ profile

ไฟล์สำคัญ

- `shared/supabase/client.js`
- `shared/context/UserAuthContext.jsx`
- `shared/services/profileService.js`
- `shared/auth/ProtectedRoute.jsx`

หน้าที่หลัก

- bootstrap Supabase Auth session
- ถือ `user` และ `profile` กลางทั้ง app
- sync profile row และ profile image bucket
- update `patient_presence` เมื่อ patient online

### 3.2 Realtime transport และ session persistence

ไฟล์สำคัญ

- `shared/gateway/realtimeTransport.js`
- `shared/hooks/usePersistedGatewaySession.js`
- `shared/services/sessionService.js`
- `shared/services/sessionOutbox.js`
- `shared/hooks/useOfflineSessionSync.js`

หน้าที่หลัก

- pair sensors ผ่าน Browser BLE
- decode Packet V1 ใน browser
- broadcast `DATA` และ control messages ให้ route ต่าง ๆ
- queue completed sessions ลง IndexedDB
- flush pending sessions ไป Supabase ตอน online

### 3.3 Shared gait runtime และ dashboards

ไฟล์สำคัญ

- `shared/gait/`
- `shared/gait/gaitProcessorClient.js`
- `shared/gait-dashboard/app.js`
- `shared/gait-dashboard/ui/charts.js`
- `shared/gait-dashboard/styles/main.css`

หน้าที่หลัก

- analyze gait metrics จาก raw sensor stream
- รัน worker-backed processing เพื่อลด UI jank
- ใช้ runtime ชุดเดียวกันทั้ง patient local dashboard และ doctor remote live dashboard

### 3.4 Live mirror ระหว่าง patient กับ doctor

ไฟล์สำคัญ

- `apps/patient/src/components/PatientLiveGaitMirror.jsx`
- `apps/clinic/src/components/DoctorLiveGaitDashboard.jsx`
- `shared/services/liveGaitBroadcast.js`

หน้าที่หลัก

- patient app mount mirror แบบ global ภายใน auth context
- mirror เลือก stream หลักโดย prefer sensor ที่ `sensor_mount === 'shank'`
- publish sample batches ไปยัง Supabase Realtime Broadcast เมื่อมี viewer ฝั่ง doctor
- doctor live dashboard subscribe stream ผ่าน route `/clinic/live-gait/:patientId`

## 4. Patient app

entry file คือ `apps/patient/src/main.jsx`

### Route map ปัจจุบัน

| Route | Screen | Purpose |
| --- | --- | --- |
| `/` | `Login.jsx` | auth entry หลัก |
| `/login` | `Login.jsx` | email and password login |
| `/register` | `Register.jsx` | patient sign up |
| `/home` | `Home.jsx` | patient dashboard |
| `/profile` | `Profile.jsx` | profile editing และ patient ID |
| `/settings` | `Settings.jsx` | profile-backed theme, language, step goal, privacy, export, and account deletion |
| `/therapy` | `TherapySelect.jsx` | เลือก therapy mode |
| `/device-connection` | `DeviceConnection.jsx` | pair sensors ผ่าน Browser BLE |
| `/calibration` | `Calibration.jsx` | calibration flow |
| `/walk-session` | `FreeWalkSession.jsx` | free walk session |
| `/walk-summary` | `WalkSummary.jsx` | session summary after a walk or from history |
| `/analysis-result` | redirect | compatibility redirect ไป `/walk-summary` |
| `/history` | `History.jsx` | history ของ patient |
| `/telemedicine` | `Telemedicine.jsx` | chat กับหมอที่ลิงก์ผ่าน Patient ID |
| `/gait-dashboard` | `GaitDashboard.jsx` | local gait dashboard |
| `/clinic/gait-dashboard` | redirect | compatibility redirect ไป `/gait-dashboard` |
| `/game/clearance` | `GameClearance.jsx` | High Stepper |
| `/game/balance` | `GameBalance.jsx` | Magic Plate |
| `/game/rhythm` | `GameRhythm.jsx` | Rhythm Drummer |
| `/game/stepping-stones` | `GameSteppingStones.jsx` | Stepping Stones |

หมายเหตุ

- route ส่วนใหญ่ถูกห่อด้วย `ProtectedRoute`
- `PatientLiveGaitMirror` ถูก mount ระดับบนสุดของ patient app ทุกครั้งที่ user เป็น patient

## 5. Clinic app

entry file คือ `apps/clinic/src/main.jsx`

clinic app ใช้ `basename = '/clinic'` และมี role guard ที่ยอมเฉพาะ user ที่เป็น doctor

### Route map ปัจจุบัน

| Route | Screen | Purpose |
| --- | --- | --- |
| `/clinic` | `DoctorDashboard.jsx` | dashboard หลักของ doctor |
| `/clinic/chat` | `DoctorChat.jsx` | chat กับผู้ป่วยที่ลิงก์ผ่าน Patient ID |
| `/clinic/patients/:patientId` | `DoctorPatientDetail.jsx` | patient detail และรายการ sessions |
| `/clinic/patients/:patientId/analysis/:sessionId` | `DoctorAnalysisReview.jsx` | review ราย session |
| `/clinic/live-gait/:patientId` | `DoctorLiveGaitDashboard.jsx` | live dashboard ผ่าน Supabase Realtime |

## 6. Frontend data model ที่ผู้ใช้เห็น

`sessionService.js` ทำหน้าที่เป็น model adapter ระหว่างตาราง Supabase กับ UI cards ทั้ง patient และ clinic

สิ่งที่ service นี้ทำ

- map `session_type` ไปเป็น label และ tone ที่อ่านง่าย
- map `sessions.details` ไปเป็น card metrics ของ High Stepper, Magic Plate, และ Rhythm Drummer
- query doctor dashboard, patient detail, analysis review, และ history จาก schema เดียวกัน
- fallback ถ้าบาง environment ยังไม่มี `sessions.details`

## 7. Environment variables ฝั่ง frontend

จำเป็น

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

ใช้ในบาง flow

- `VITE_SUPABASE_PROFILE_BUCKET`
- `VITE_SUPABASE_AUTH_REDIRECT_URL`
- `VITE_SUPABASE_SKIP_EMAIL_CONFIRMATION`
- `SUPABASE_SERVICE_ROLE_KEY` สำหรับ local signup helper ใน dev server เท่านั้น

## 8. Known caveats ฝั่ง frontend

- live sensor mode ต้องใช้ browser ที่รองรับ Web Bluetooth จริง
- doctor live dashboard ใช้ Supabase Realtime Broadcast ดังนั้น smoothness และ quota ขึ้นกับ batch settings และจำนวน viewers
- package name ใน `package.json` ยังเป็น `react-firebase-auth` แต่ไม่สะท้อน architecture ปัจจุบันแล้ว
- PWA cache อาจทำให้เห็น build เก่าหลัง deploy จนกว่าจะ refresh service worker
