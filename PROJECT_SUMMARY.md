# DernDee Project Summary

อัปเดตจากการอ่านโค้ดใน repository นี้เมื่อวันที่ 2026-04-02

## 1. ภาพรวมโครงการ

DernDee เป็นระบบกายภาพบำบัดการเดินแบบ real-time ที่เชื่อม 3 ส่วนเข้าด้วยกัน:

1. อุปกรณ์สวมใส่และเซนเซอร์ IMU
2. backend สำหรับรับข้อมูล BLE และวิเคราะห์ gait แบบ real-time
3. web application สำหรับผู้ป่วย, เกมฝึกเดิน, และหน้าจอสำหรับนักกายภาพ/แพทย์

เป้าหมายหลักของระบบคือช่วยให้ผู้ใช้สามารถฝึกเดิน, รับ feedback ระหว่างฝึก, และติดตามผลการฝึกผ่าน dashboard และสรุปผลย้อนหลังได้

## 2. โครงสร้างของ repository

- `DernDee_Web-app/`
  Frontend หลักของระบบ เขียนด้วย React + Vite + Firebase

- `gateway_v2/`
  Python realtime gateway สำหรับสแกน BLE, ถอดรหัสข้อมูลเซนเซอร์, วิเคราะห์ gait, และ broadcast ผ่าน WebSocket

- `Avatar_DernDee/`
  ชุดภาพ avatar ที่ใช้กับส่วน UI/feedback

- `Gamification/`
  วิดีโอและสื่อดิบที่เกี่ยวข้องกับเกมหรือ prototype

- `master_template.json`
  ไฟล์ template ของ gait curve ที่ดูเป็น asset สำหรับงานวิเคราะห์ แต่ในโค้ดปัจจุบันยังไม่พบจุดที่เรียกใช้งานโดยตรง

## 3. เทคโนโลยีหลัก

### Frontend

- React 18
- React Router
- Firebase Authentication
- Firestore
- Firebase Storage
- Vite
- Tailwind CSS
- Lucide React

อ้างอิง:
- `DernDee_Web-app/package.json`
- `DernDee_Web-app/vite.config.js`

### Backend Realtime

- Python
- `bleak` สำหรับ BLE
- `websockets`
- `numpy`
- `scipy`

อ้างอิง:
- `gateway_v2/main.py`
- `gateway_v2/connection.py`
- `gateway_v2/shoe_detector.py`
- `gateway_v2/gait_estimator.py`
- `gateway_v2/feedback_engine.py`

## 4. สถาปัตยกรรมระดับสูง

ลำดับการไหลของข้อมูลในระบบปัจจุบันเป็นแบบนี้:

1. Sensor ส่งข้อมูลผ่าน BLE
2. `gateway_v2` สแกนและเชื่อมต่ออุปกรณ์ที่ขึ้นต้นด้วยชื่อ `DernDee`
3. backend ถอดรหัส packet และแปลงหน่วยเป็นข้อมูลฟิสิกส์
4. ระบบ calibration ปรับ bias และ alignment
5. CWT walking detector ตรวจว่าขณะนั้นเป็นการเดินจริงหรือ noise
6. ZUPT gait estimator คำนวณ stride length, clearance, speed และ metric เพิ่มเติม
7. feedback engine สร้างข้อความแนะนำแบบนักกายภาพ
8. backend broadcast ข้อมูลทั้งหมดให้ frontend ผ่าน WebSocket ที่พอร์ต `8765`
9. หน้า frontend ต่าง ๆ ใช้ payload ชุดเดียวกันในการแสดงผล, game logic, avatar coaching และ calibration flow

## 5. ส่วนประกอบหลักของ Frontend

### 5.1 Authentication และ User Context

ระบบ auth อยู่ใน `DernDee_Web-app/src/context/UserAuthContext.jsx`

หน้าที่หลัก:

- login ด้วย email/password
- sign up
- Google sign-in
- สร้างหรืออัปเดต profile ใน Firestore ที่ `users/{uid}`
- เก็บ `physicalTherapyData` ตั้งต้นให้ user ใหม่

Protected route อยู่ใน `DernDee_Web-app/src/auth/ProtectedRoute.jsx`

ปัจจุบันเช็คเฉพาะว่า user login อยู่หรือไม่ ยังไม่ได้แยก role ผู้ป่วย/แพทย์

### 5.2 Patient App

route หลักของฝั่งผู้ป่วยมีดังนี้:

- `/login`
- `/register`
- `/home`
- `/profile`
- `/settings`
- `/therapy`
- `/calibration`
- `/walk-session`
- `/walk-summary`
- `/history`
- `/analysis-result`
- `/telemedicine`
- `/game/clearance`
- `/game/balance`
- `/game/rhythm`

ไฟล์ route entry อยู่ที่:
- `DernDee_Web-app/src/main.jsx`

### 5.3 Doctor App

route หลักของฝั่ง doctor:

- `/doctor`
- `/doctor/chat`
- `/doctor/patients/:patientId`
- `/doctor/patients/:patientId/analysis/:sessionId`

หน้ากลุ่มนี้มี UI และ flow ค่อนข้างครบ แต่ข้อมูลจำนวนมากยังอิง mock data

## 6. Patient Flow ที่อ่านได้จากโค้ด

ลำดับการใช้งานหลักของผู้ป่วยในโค้ดตอนนี้คือ:

1. Login/Register
2. เข้า Home
3. เลือก Therapy Mode
4. เข้า Calibration
5. ไปยัง Free Walk หรือ Rehab Game
6. จบ session แล้วไปหน้า Walk Summary
7. เปิดดู History หรือ Analysis Result ภายหลัง

### Home

หน้า Home:

- โหลด profile จาก Firestore
- แสดง progress card
- ใช้เป็น hub ไปยัง therapy, history, analysis, telemedicine, profile, settings

ไฟล์:
- `DernDee_Web-app/src/components/Home.jsx`

### Device Connection

หน้า device connection ตอนนี้เป็น UI จำลองการค้นหาและเชื่อมอุปกรณ์:

- ตรวจว่ามี `navigator.bluetooth`
- จำลองรายการ device
- จำลองสถานะ scanning/connecting/connected/error

ยังไม่ได้เชื่อม Web Bluetooth หรือ backend BLE จริง

ไฟล์:
- `DernDee_Web-app/src/components/DeviceConnection.jsx`

### Calibration

หน้า calibration เชื่อม WebSocket ไปยัง backend:

- เปิด socket ไปที่ `ws://<host>:8765`
- ส่งข้อความ `CALIBRATE`
- รอ `CALIBRATION_DONE` หรือ `CALIBRATION_FAILED`
- เมื่อเสร็จแล้วจึงอนุญาตให้เริ่ม session

ไฟล์:
- `DernDee_Web-app/src/components/Calibration.jsx`

### Walk Session

หน้า walk session คือหน้าที่เชื่อม realtime data กับ avatar feedback:

- รับ `DATA` จาก WebSocket
- อ่านจำนวนก้าว, speed, gait metrics, feedback
- แสดง avatar ตามประเภท feedback
- พูดข้อความด้วย browser TTS
- สะสม stride length, clearance, speed, step duration ไว้เพื่อสรุปหลังจบ session

ไฟล์:
- `DernDee_Web-app/src/components/WalkSession.jsx`

### Walk Summary

หน้า summary ตอนนี้รับข้อมูลจาก navigation state เป็นหลัก และยังไม่ได้เขียนผล session ลง Firestore

ไฟล์:
- `DernDee_Web-app/src/components/WalkSummary.jsx`

### History และ Analysis Result

สองหน้าหลักนี้พยายามอ่านข้อมูลจาก collection `walkSessions`:

- `History.jsx` อ่านรายการย้อนหลังทั้งหมดของ user
- `AnalysisResult.jsx` อ่าน session ล่าสุดของ user

ถ้าไม่มีข้อมูลหรือ query ล้มเหลว จะ fallback ไปใช้ mock data

ไฟล์:
- `DernDee_Web-app/src/components/History.jsx`
- `DernDee_Web-app/src/components/AnalysisResult.jsx`

## 7. Game Modes

โปรเจคนี้มีเกมกายภาพ 3 แบบที่ต่อกับ WebSocket backend เดียวกัน

### 7.1 High Stepper

ไฟล์:
- `DernDee_Web-app/src/components/games/GameClearance.jsx`

แนวคิด:

- ใช้ `payload.position[2]` เป็นความสูงของเท้า
- คิด rep เมื่อผู้ใช้ยกเท้าสูงเกิน target
- มี peak-hold logic เพื่อกันค่ากระพริบจากการ reset ของ estimator

### 7.2 Magic Plate / Balance

ไฟล์:
- `DernDee_Web-app/src/components/games/GameBalance.jsx`

แนวคิด:

- ใช้ quaternion จาก backend
- แปลงเป็น roll/pitch
- มีการ auto-tare และ manual recalibration
- ใช้ตำแหน่ง bubble บนวงกลมเป็นตัวแทนความสมดุล

### 7.3 Rhythm Drummer

ไฟล์:
- `DernDee_Web-app/src/components/games/GameRhythm.jsx`

แนวคิด:

- สร้าง metronome ด้วย BPM ที่ตั้งได้
- จับ step timing จากข้อมูล realtime
- ให้คะแนนว่า step นั้น `perfect`, `good` หรือ `miss`
- คำนวณ cadence, accuracy, score และ streak

## 8. Doctor Flow

### Doctor Dashboard

ไฟล์:
- `DernDee_Web-app/src/components/doctor/DoctorDashboard.jsx`

ทำหน้าที่:

- query จำนวน patient ที่ผูกกับ `physicalTherapyData.therapistId`
- query session ล่าสุด
- แต่สุดท้ายยังใช้ `mockDashboardStats` และ `mockRecentPatients` เป็นหลัก

### Patient Detail

ไฟล์:
- `DernDee_Web-app/src/components/doctor/DoctorPatientDetail.jsx`

ทำหน้าที่:

- ดูข้อมูลผู้ป่วย
- ดูรายการ therapy session
- กดเข้า review ราย session

ข้อมูลตอนนี้ยังมาจาก `mockDoctorData.js`

### Analysis Review

ไฟล์:
- `DernDee_Web-app/src/components/doctor/DoctorAnalysisReview.jsx`

ทำหน้าที่:

- ดู metric ของ session
- เลือก review status
- เขียน review note

แต่การ save ไป Firestore ยังถูกคอมเมนต์ไว้ และยังเป็น simulation

### Doctor Chat

ไฟล์:
- `DernDee_Web-app/src/components/doctor/DoctorChat.jsx`

ทำหน้าที่:

- เปิดรายชื่อผู้ป่วย
- ส่งข้อความระหว่าง doctor กับ patient

ปัจจุบันเป็น local mock state ทั้งหมด

## 9. Telemedicine

ไฟล์:
- `DernDee_Web-app/src/components/Telemedicine.jsx`

ตอนนี้เป็น mock screen สำหรับ:

- แชตกับแพทย์
- ส่ง analysis result เข้าแชต
- ปุ่มเริ่ม video/voice call

ยังไม่ต่อ backend จริง

## 10. โครงสร้างและหน้าที่ของ Backend Realtime

### 10.1 BLE Connection Layer

ไฟล์:
- `gateway_v2/connection.py`

หน้าที่:

- scan BLE device ด้วย `BleakScanner`
- connect อุปกรณ์ที่ชื่อขึ้นต้นด้วย `DernDee`
- subscribe notification ที่ characteristic ที่กำหนด

### 10.2 Packet Decode และ Scaling

ไฟล์:
- `gateway_v2/decoder.py`
- `gateway_v2/scaling.py`

หน้าที่:

- decode packet binary จาก ESP32
- ตรวจ header และ checksum
- แปลงค่า raw accel/gyro ไปเป็นหน่วยจริง

### 10.3 Calibration

ไฟล์:
- `gateway_v2/calibration.py`

หน้าที่:

- เก็บข้อมูลคงที่ระหว่าง calibration
- คำนวณ gyro bias
- คำนวณ average accel
- คำนวณ accel scale
- ใช้ average gravity เพื่อ initialize orientation ทันที

### 10.4 Walking Detection

ไฟล์:
- `gateway_v2/shoe_detector.py`

หน้าที่:

- ใช้ gyro norm แบบ orientation-independent
- ใช้ CWT เพื่อขยาย signal
- ใช้ adaptive threshold แยก walking bout จาก noise

### 10.5 Gait Estimation

ไฟล์:
- `gateway_v2/gait_estimator.py`

หน้าที่:

- orientation tracking ด้วย Madgwick filter
- หมุน accel ไป world frame
- ลบ gravity
- detect stance / toe-off / heel-strike
- ใช้ ZUPT และ linear dedrift
- คำนวณ stride length, clearance, speed
- คำนวณ symmetry และ metric เพิ่มเติมสำหรับ virtual coach

### 10.6 Feedback Engine

ไฟล์:
- `gateway_v2/feedback_engine.py`

หน้าที่:

- วิเคราะห์ metric ของแต่ละ step
- ให้ feedback แบบนักกายภาพ
- จัดลำดับความสำคัญเป็น safety, foundation, performance, praise
- มี anti-spam และ cooldown

### 10.7 WebSocket Broadcast

ไฟล์:
- `gateway_v2/main.py`

หน้าที่:

- รับ client WebSocket
- รับคำสั่ง `CALIBRATE` และ `RESET`
- broadcast payload `DATA`

payload ที่ frontend ใช้อยู่มีประมาณนี้:

- `is_walking`
- `step_detected`
- `position`
- `velocity`
- `quaternion`
- `total_steps`
- `gait_metrics`
- `feedback`

## 11. Data Model ที่เห็นจากโค้ด

### Firestore `users`

ถูกสร้างตอน login ครั้งแรก มีข้อมูลประมาณนี้:

- `uid`
- `email`
- `displayName`
- `photoURL`
- `createdAt`
- `lastLoginAt`
- `isNewUser`
- `physicalTherapyData`

### Firestore `walkSessions`

หลายหน้าพยายามอ่านข้อมูลจาก collection นี้ เช่น:

- history
- analysis result
- doctor dashboard

field ที่คาดว่าจะมี:

- `userId`
- `createdAt`
- `cadence`
- `stepLength`
- `strideLength`
- `walkingSpeed`
- `doubleSupportTime`
- `singleSupportTime`
- `duration`
- `totalSteps`

แต่ใน codebase ปัจจุบันยังไม่พบ flow ที่เขียน session จริงลง collection นี้

## 12. สถานะปัจจุบันของโครงการ

### ส่วนที่เป็นของจริงค่อนข้างชัดแล้ว

- Firebase auth และการสร้าง user profile
- protected routes
- calibration flow ผ่าน WebSocket
- realtime walk session
- game screens ที่อ่านข้อมูลจาก backend จริง
- Python realtime pipeline สำหรับ BLE -> gait analysis -> feedback

### ส่วนที่ยังเป็น mock หรือยังไม่สุดปลายสาย

- device connection ฝั่ง frontend
- telemedicine chat และ call
- doctor chat
- doctor review save
- recent patient data ฝั่ง doctor
- history/analysis ที่ยัง fallback mock data บ่อย
- session persistence ลง Firestore

## 13. จุดไม่สอดคล้องกันที่ควรทราบ

### README ยังไม่ตรงกับโค้ดปัจจุบัน

README ใน `DernDee_Web-app/README.md` ยังบอกว่า:

- frontend เป็น React Native
- ระบบใช้ sensor 5 จุด
- dev server อยู่ที่ `5173`

แต่โค้ดปัจจุบันแสดงว่า:

- frontend เป็น React web app บน Vite
- Vite dev server ตั้งไว้ที่ `5174`
- backend realtime รุ่น `gateway_v2` พูดถึงสถาปัตยกรรมแบบ 2 foot sensors

### Device model ยังไม่ sync กัน

- หน้า `DeviceConnection.jsx` ยัง model อุปกรณ์ 5 จุด
- backend `gateway_v2` ปัจจุบันออกแบบรอบระบบ foot-mounted dual-sensor

### Walk session ยังไม่บันทึกลงฐานข้อมูล

- หน้าสรุปใช้ navigation state
- History/AnalysisResult อ่าน `walkSessions`
- แต่ยังไม่มีจุดเขียน session จริงลง Firestore

### หน้า Analysis Result ไม่ได้ใช้ session ที่ส่งมาจาก History

- History ส่ง `state: { session }`
- แต่ AnalysisResult fetch latest session ใหม่ตลอด

### Doctor routes ยังมีจุดที่หลุด

- ปุ่ม back ใน `DoctorPatientDetail.jsx` นำทางไป `/doctor/patients`
- แต่ route นี้ไม่มีใน router

### มี field mismatch หนึ่งจุดใน backend

- estimator ส่ง `push_off_velocity_mps`
- feedback engine อ่าน `push_off_power`

ผลคือ feedback หมวด push-off มีแนวโน้มจะไม่ทำงานตามที่ตั้งใจ

## 14. ข้อเสนอแนะลำดับถัดไป

1. ทำ persistence ของ `walkSessions` ให้ครบ
2. sync frontend patient flow กับ schema จริงของ session
3. ทำ role-based access สำหรับ patient และ doctor
4. ตัดสินใจให้ชัดว่าระบบปัจจุบันจะเดินด้วย 2 sensors หรือ 5 sensors แล้ว sync UI/README/backend ให้ตรงกัน
5. เปลี่ยน doctor screens จาก mock data ไปใช้ Firestore จริง
6. เก็บ review notes และสถานะ review ลงฐานข้อมูลจริง
7. เพิ่ม automated tests อย่างน้อยสำหรับ gait pipeline และ route/data integration

## 15. วิธีรันโดยสรุป

### Frontend

```bash
cd DernDee_Web-app
npm install
npm run dev
```

frontend จะรันที่:

- `http://localhost:5174`

### Backend Realtime

```bash
cd gateway_v2
python3 main.py
```

backend WebSocket จะรันที่:

- `ws://0.0.0.0:8765`

หมายเหตุ:

- ต้องมี dependency ฝั่ง Python ติดตั้งไว้ก่อน
- frontend ที่ใช้ calibration, walk session, และ game modes ต้องเข้าถึง WebSocket นี้ได้

## 16. สรุปสั้นที่สุด

DernDee ใน repository นี้มีแกนที่ชัดมากแล้ว:

- patient web app
- realtime gait gateway
- rehab mini-games
- doctor review surface

สิ่งที่พร้อมสุดตอนนี้คือฝั่ง realtime interaction และ game/therapy flow
ส่วนที่ควรพัฒนาต่อให้ครบ production มากขึ้นคือ session persistence, doctor workflow จริง, และการ sync เอกสารกับสถาปัตยกรรมเวอร์ชันล่าสุด
