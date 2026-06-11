# PRD: SOTA Stroke Gait Analysis System

อัปเดตตามโค้ดและทิศทางผลิตภัณฑ์ของ repository นี้ ณ 2026-06-11

เอกสารนี้พัฒนาต่อจากร่าง PRD เดิม โดยแปลงเป้าหมายระดับ SOTA ให้เข้ากับสถาปัตย์จริงของโปรเจกต์ DernDee ในปัจจุบัน

หลักการสำคัญของเอกสารนี้คือ

- รักษา intent ทางคลินิกและงานวิจัยจากร่างเดิม
- ไม่ยึดติดกับ implementation stack ที่ขัดกับ repo ปัจจุบันโดยไม่จำเป็น
- แยกให้ชัดระหว่างสิ่งที่มีอยู่แล้วในระบบ, สิ่งที่ต้องเพิ่ม, และสิ่งที่ยังต้องตัดสินใจ

## 1. Executive Summary

DernDee มีฐานระบบที่พร้อมต่อยอดอยู่แล้วใน 4 ด้าน

1. Browser BLE transport สำหรับ live IMU streaming
2. shared gait analytics runtime ที่รันใน frontend ได้จริง
3. patient และ clinic web apps พร้อม auth, history, review, และ live dashboard
4. Supabase data layer สำหรับ persistence และ clinical workflow

PRD ฉบับนี้กำหนดทิศทางให้ระบบ evolve จาก current shank-centric gait runtime ไปเป็นระบบวิเคราะห์การเดินระดับสูงสำหรับผู้ป่วย Stroke ที่รองรับ

- progressive sensor topology ตั้งแต่ 1 shank sensor ไปจนถึง 4 IMUs ที่ต้นขาและหน้าแข้งทั้งสองข้าง
- orientation fusion แบบ quaternion-based สำหรับ mode ที่มี joint modeling
- gait event detection แบบ CSAV และ corrective factors สำหรับ pathological gait
- joint kinematics เช่น knee angle เมื่อมี thigh + shank pair และ bilateral analytics เมื่อมี 4 sensors
- drift-controlled spatial estimation ที่ใช้ stride reset + ZUPT
- clinician-facing analytics ที่ตีความได้และติดตามการฟื้นฟูได้จริง

## 2. Product Goal

สร้างระบบวิเคราะห์การเดินแบบสวมใส่ที่ให้ข้อมูลเชิงปริมาณใกล้มาตรฐานอ้างอิงในระดับงานวิจัย โดยออกแบบให้ใช้งานจริงใน workflow ของผู้ป่วย Stroke และนักกายภาพบำบัดได้ผ่าน web application เดียว

## 3. Problem Statement

ผู้ป่วย Stroke มักมี pathological gait เช่น เดินช้า, toe drag, circumduction, asymmetry, และ phase timing ที่ผิดปกติ ทำให้ detector แบบ healthy-gait assumptions ใช้งานได้ไม่เสถียร

ระบบเป้าหมายต้องแก้ปัญหา 3 ชั้นพร้อมกัน

1. วัดเหตุการณ์การเดินและ phase timing ได้แม่นพอใน gait ที่ช้าและผิดรูปแบบ
2. คำนวณ kinematics และ derived metrics ได้ต่อเนื่องพอสำหรับติดตาม rehabilitation progress
3. นำข้อมูลไปแสดงผลและ review ได้ใน workflow ของ patient และ clinician โดยไม่แยกเครื่องมือหลายชุดเกินจำเป็น

## 4. Target Users

### Primary users

- ผู้ป่วย Stroke ที่มี pathological gait
- นักกายภาพบำบัดที่ต้องใช้ข้อมูลเชิงปริมาณเพื่อปรับแผนฟื้นฟู

### Secondary users

- นักวิจัยหรือทีมวิศวกรรมที่ต้องเทียบระบบกับ gold-standard tools
- ผู้ดูแลระบบคลินิกที่ต้องติดตามคุณภาพข้อมูลและความพร้อมของอุปกรณ์

## 5. Product Scope

### In scope

- 1-4 IMU wearable gait analysis โดยมี shank-only CSAV mode เป็น baseline และ 4-IMU bilateral mode เป็น target เต็มรูปแบบ
- realtime event detection และ phase segmentation สำหรับผู้ป่วย Stroke
- bilateral thigh-shank orientation pipeline
- knee angle estimation
- session summary และ trend tracking
- clinician review workflow บน clinic app
- live gait monitoring บน web dashboard
- offline-first session persistence

### Out of scope for the first productized release

- full-body motion capture replacement
- force plate replacement
- EMG integration
- fully autonomous treatment recommendation engine
- medical diagnosis automation

## 6. Translation From The Draft To The Current Repo

ร่าง PRD เดิมมีเจตนาถูกต้อง แต่ implementation stack บางส่วนไม่สอดคล้องกับ repo ปัจจุบัน จึงต้อง translate ให้ตรงความจริง

| Area | Draft PRD | Current repo baseline | Decision in this PRD |
| --- | --- | --- | --- |
| Sensor nodes | MPU9150 + Arduino UNO + I2C | ESP32 BLE IMU nodes, Browser BLE transport | ใช้ BLE node architecture เป็น primary path เพราะสอดคล้องกับระบบที่มีอยู่แล้ว |
| Sensor count | 4 จุด: 2 thighs + 2 shanks | transport รองรับ 5 slot อยู่แล้ว: pelvis, 2 thighs, 2 shanks | รองรับ 1-4 sensors แบบ capability tiers โดย target full mode คือ 4 sensors และต้องไม่ทำลาย shank-only CSAV baseline |
| Orientation fusion | Madgwick | ปัจจุบันมี shank-angle path แบบ Kalman-centric | เพิ่ม quaternion-based fusion layer เป็น target evolution ของ runtime |
| Visualization | Processing 2 + MATLAB | web dashboard runtime, Chart.js, React apps | ใช้ web-first visualization เป็น primary, export CSV/MATLAB-compatible data เป็น secondary |
| Data workflow | standalone local rig | Supabase auth/history/review/live broadcast | ใช้ Supabase workflow ต่อไปเพื่อให้ clinician path ไม่แตกเป็นหลายระบบ |

สรุป: intent ของร่างเดิมยังคงอยู่ แต่ stack เป้าหมายควรเป็น web-first, BLE-first, และ clinician-workflow-aware เพื่อไม่ย้อนสถาปัตย์จากของที่มีอยู่แล้ว

## 7. Current Baseline In This Repo

ระบบที่มีอยู่แล้วใน repo นี้

- Browser BLE transport ใน `DernDee_Web-app/shared/gateway/realtimeTransport.js`
- shared gait runtime ใน `DernDee_Web-app/shared/gait/`
- shared dashboard runtime ใน `DernDee_Web-app/shared/gait-dashboard/`
- patient app และ clinic app ใน `DernDee_Web-app/apps/`
- session persistence และ offline outbox ใน `DernDee_Web-app/shared/services/sessionService.js` และ `DernDee_Web-app/shared/services/sessionOutbox.js`
- live doctor broadcast path ใน `DernDee_Web-app/shared/services/liveGaitBroadcast.js`
- Supabase schema สำหรับ profile, presence, sessions, gait metrics, และ review flow

ข้อจำกัดของ baseline ปัจจุบัน

- runtime ปัจจุบันยัง shank-centric เป็นหลัก
- joint-angle computation ยังไม่ถูก productize เป็น pipeline หลัก
- gait event detector ปัจจุบันยังไม่ใช่ CSAV 7-phase model
- current metrics ยังออกแบบรอบ cycle แบบ HS-to-HS และมุ่งที่ shank-derived measures เป็นหลัก

## 8. System Requirements

### 8.1 Sensor topology

ระบบเป้าหมายต้องรองรับ IMU ตั้งแต่ 1-4 จุด โดย target full-bilateral mode คือ 4 จุด

- Left Thigh
- Right Thigh
- Left Shank
- Right Shank

และควรรองรับ optional pelvis/chest slot สำหรับ future expansion โดยไม่ทำลาย compatibility กับ transport layer ปัจจุบัน

### 8.1.1 Sensor capability tiers

| Mode | Sensor set | Primary purpose | Minimum supported outputs |
| --- | --- | --- | --- |
| 1-sensor CSAV mode | single shank | gait event detection และ phase timing จาก shank angular velocity | HS/FF/HR/TO/FA/TBV/IC เมื่อ confidence พอ, cadence, stride timing, stance/swing timing, quality flags |
| 2-sensor joint mode | ipsilateral shank + thigh | knee angle และ side-specific kinematics | shank CSAV events + knee angle + improved side-specific speed/step estimates |
| 3-sensor hybrid mode | one thigh-shank pair + contralateral shank | unilateral joint model + bilateral temporal comparison | unilateral knee angle + bilateral CSAV events + asymmetry cues |
| 4-sensor bilateral mode | two thighs + two shanks | full target mode | bilateral knee angle, symmetry, richer spatial metrics, best clinical analytics |

หมายเหตุสำคัญ

- ถ้าเหลือเพียง 1 shank sensor ระบบยังต้องทำงานใน CSAV mode ได้
- ถ้าได้ shank + thigh pair ระบบต้อง unlock joint-model path โดยไม่ทิ้ง CSAV core detector
- ถ้า 2 sensors เป็น bilateral shanks แทน ipsilateral thigh + shank ระบบยังควรทำ bilateral temporal CSAV mode ได้ แต่จะยังไม่ถือว่าเป็น knee-angle mode

### 8.2 Sampling and transport

- sampling target ขั้นต่ำ: 100 Hz ต่อ sensor
- packet ต้องมี sequence และ timestamp ที่เชื่อถือได้ต่อ sensor
- transport ต้องสามารถ map sample ไปยัง body position ได้ชัดเจน
- ต้องมี quality flags สำหรับ packet loss, stale stream, sensor drift, และ missing side

### 8.3 Orientation fusion

ระบบต้องมี quaternion-based fusion layer สำหรับทุก sensor ที่ใช้ใน joint kinematics

ใน 1-sensor shank-only CSAV mode, quaternion fusion ไม่ใช่ hard dependency สำหรับ core event detection และระบบต้องยังสามารถรัน detector จาก gyro angular velocity เป็นหลักได้

minimum requirements

- รองรับ accelerometer + gyroscope fusion
- รองรับ magnetometer ถ้าใช้จริง แต่ไม่บังคับใน first clinical runtime
- มี calibration step สำหรับ sensor-to-segment alignment
- expose orientation เป็น quaternion และ rotation matrix ที่ใช้ต่อใน joint computation ได้

### 8.4 Gait event detection

ระบบเป้าหมายต้องรองรับการแบ่ง gait cycle แบบ CSAV-informed 7-phase model

required events

- Heel Strike (HS)
- Foot Flat (FF)
- Heel Rise (HR)
- Toe Off (TO)
- Feet Adjacent (FA)
- Tibia Vertical (TBV)
- Initial Contact (IC)

required behaviors

- ใช้ shank angular velocity accumulation เป็นแกนหลัก
- ใน shank-only mode ต้องใช้ mediolateral shank angular velocity จาก gyroscope เป็น primary variable ไม่ใช่ accelerometer
- มี corrective factors สำหรับ slow gait และ pathological timing
- ใช้ stride time และ zero-crossing anchors เป็น context variables
- มี confidence score ต่อ event และต่อ cycle
- ถ้า event บางตัว unresolved ต้อง fallback แบบ explicit ไม่ใช่ silently impute

accelerometer role

- accelerometer ใช้เป็น auxiliary signal สำหรับ orientation, shank-to-vertical cues, หรือ event validation ได้
- accelerometer ไม่ควรแทนที่ gyro-driven CSAV core logic ใน single-shank mode

### 8.5 Joint kinematics

ระบบต้องคำนวณ metrics ตาม sensor mode ที่มีจริง ไม่ใช่บังคับให้ทุก mode ต้องได้ output ชุดเดียวกัน

minimum outputs by mode

- 1-sensor shank-only mode: cadence, stride timing, stance/swing timing, CSAV phase events, confidence, และ derived spatial estimates เฉพาะที่ quality ผ่านเกณฑ์
- shank + thigh pair mode: knee flexion/extension angle, side-specific temporal metrics, และ improved spatial estimates ของขาข้างนั้น
- 4-sensor bilateral mode: bilateral knee angle, temporal symmetry, left-right comparison, และ richer spatial metrics

full analytics set เมื่อ sensor set รองรับ ต้องครอบคลุมอย่างน้อย

- knee flexion/extension angle ต่อข้าง
- temporal symmetry ระหว่างซ้าย-ขวา
- stride and step timing per side
- walking speed estimate
- step length / stride length estimate
- clearance estimate

joint angle requirements

- ใช้ relative orientation ระหว่าง thigh และ shank
- ต้องระบุได้ว่ามาจาก sensor pair ใด
- ต้องมี calibration state ต่อ session

### 8.6 World-frame transformation and drift control

ระบบต้องรองรับ

- sensor-frame to world-frame transformation ด้วย quaternion orientation
- gravity removal ที่แกน vertical อย่าง explicit
- stride-by-stride reset
- ZUPT ในช่วง stance ที่นิ่งพอ
- drift monitoring เพื่อ flag session ที่ quality ต่ำเกินใช้งาน

### 8.7 Product visualization

primary visualization ของผลิตภัณฑ์นี้คือ web-based dashboards

required views

- patient realtime gait dashboard
- doctor live gait dashboard
- post-session summary
- clinician review screen
- trend view สำหรับ rehab follow-up

secondary outputs ที่ควรรองรับ

- CSV export
- MATLAB-compatible exports สำหรับ research validation
- optional 3D leg playback ถ้าต้นทุน implementation สมเหตุสมผล

หมายเหตุ: Processing 2 ไม่ควรเป็น primary production surface ใน repo นี้ เพราะไม่สอดคล้องกับ web-first architecture ที่ใช้อยู่แล้ว

## 9. Functional Requirements

### FR-1: Multi-sensor session setup

ระบบต้องให้ผู้ใช้ pair และยืนยัน sensor ตาม mode ที่เลือกได้ตั้งแต่ 1-4 จุดก่อนเริ่ม session พร้อมแสดงสถานะ

- connected / disconnected
- side and segment mapping
- battery / stream health เมื่อมีข้อมูล
- calibration readiness
- selected operating mode เช่น shank-only CSAV, shank+thigh joint mode, หรือ 4-sensor bilateral mode

### FR-2: Calibration workflow

ระบบต้องมี calibration flow ที่ครอบคลุมอย่างน้อย

- static calibration
- sensor-to-segment alignment
- left/right consistency check
- calibration validity timeout หรือ re-center requirement
- mode-aware calibration rules โดย single-shank mode ต้องไม่ถูกบังคับให้ทำ thigh-pair calibration ที่ไม่เกี่ยวข้อง

### FR-3: Stroke-aware gait event detection

ระบบต้องตรวจ event ได้แม้ stride time ยาว, asymmetry สูง, หรือ signal morphology ผิดจาก healthy gait

- single-shank mode ต้องยังใช้ CSAV จาก shank angular velocity เป็น detector หลัก
- ต้องบันทึก unresolved event cases อย่างชัดเจน
- ต้องมี cycle confidence และ event confidence
- ต้องมี fallback rules ที่ตรวจสอบย้อนหลังได้

### FR-4: Joint-angle and kinematic analytics

ระบบต้องคำนวณและเก็บผลต่อ cycle และต่อ session ตาม sensor mode ที่มีอยู่จริง โดยไม่บังคับว่า single-shank mode ต้องปลอม output ระดับ joint model

required by mode

- single-shank mode: event timing, cadence, stride timing, stance/swing timing, signal quality, และ CSAV-derived phase outputs
- shank + thigh pair mode: เพิ่ม knee angle extrema/waveform summary และ side-specific kinematics
- 4-sensor mode: เพิ่ม bilateral symmetry features และ left-right joint analytics

full set เมื่อ sensor set รองรับ

- knee angle extrema and waveform summary
- cadence
- stance / swing timing
- step and stride length
- walking speed
- clearance
- symmetry features

### FR-5: Session persistence and reviewability

ระบบต้อง persist session และ metrics ในรูปที่แพทย์หรือนักกายภาพบำบัด review ย้อนหลังได้

- summary-level session row
- per-cycle or per-event metrics rows ที่เพียงพอสำหรับ audit
- quality flags
- algorithm version
- calibration metadata

### FR-6: Live clinician monitoring

doctor ต้องเห็น stream และ derived metrics แบบ near-real-time ได้เมื่อ patient ออนไลน์อยู่

- แสดง status ว่า data quality อยู่ในระดับใด
- แยกให้เห็น left/right stream health
- เตือนเมื่อ sensor ขาดหายหรือ side pairing ไม่ครบ
- ระบุ current sensor mode ให้ชัด เพื่อให้ clinician รู้ว่าค่าไหนมาจาก CSAV-only mode และค่าไหนมาจาก joint-model mode

### FR-7: Research export path

ระบบต้อง export ข้อมูลที่จำเป็นต่อการ validate กับ gold-standard tools ได้

- timestamps ที่ align ได้
- per-sensor raw streams
- fused orientation outputs
- detected events
- derived metrics

## 10. Non-Functional Requirements

### 10.1 Accuracy targets

เนื่องจากตัวเลขในร่างเดิมเป็นระดับ research benchmark เอกสารนี้แยกเป็น 2 ชั้น

| Metric | Research benchmark | Product release gate | Notes |
| --- | --- | --- | --- |
| Swing-phase agreement | ICC > 0.988 | ICC > 0.95 | benchmark ต้องยืนยันด้วย reference system จริง |
| Walking speed error | < 7% | < 10% | ใช้ thigh + shank model เมื่อมีอย่างน้อยหนึ่ง thigh-shank pair; best bilateral estimate เมื่อ 4 sensors ครบ |
| Event timing error | < 1 ms ใน controlled setup | < 10 ms median ใน instrumented validation | ค่า < 1 ms ไม่ควรใช้เป็น field-release gate บน BLE/web runtime โดยตรง |

### 10.2 Runtime performance

- dashboard latency สำหรับ derived metrics ควรต่ำพอให้ใช้งาน live feedback ได้
- analysis ต้องไม่ block UI thread
- worker crash ต้อง recover ได้
- system ต้อง degrade gracefully เมื่อตัว sensor ไม่ครบ

### 10.3 Reliability

- session ต้องไม่หายเมื่อ network หลุดชั่วคราว
- partial sensor failure ต้องถูก flag ชัดเจน
- algorithm versioning ต้องผูกกับ session ที่บันทึก

### 10.4 Security and privacy

- ใช้ auth และ access control ของ Supabase ตาม role
- clinician ดูข้อมูลได้เฉพาะ patient ที่ถูก assign
- live stream ต้องไม่กลายเป็น public channel ที่ไม่มี role guard

## 11. Validation Requirements

ระบบต้องมี validation protocol อย่างน้อย 3 ระดับ

### Level A: Engineering validation

- replay raw data จาก recorded sessions
- unit/integration tests สำหรับ event detector และ kinematic pipeline
- compare algorithm versions บน dataset เดียวกัน

### Level B: Lab validation

- เทียบกับ video annotation, motion capture, force plate, หรือ reference IMU rig
- วัดแยกตาม sensor mode อย่างน้อยในกลุ่ม 1-sensor shank-only, shank+thigh pair, และ 4-sensor bilateral
- วัด event timing error, speed error, และ joint-angle agreement

### Level C: Clinical validation

- ทดสอบกับผู้ป่วย Stroke ที่มี gait impairment หลายระดับ
- เก็บ failure modes เช่น slow gait, assistive-device use, severe asymmetry, toe drag

## 12. Data Requirements

สำหรับ session ที่ใช้ validate หรือ train/retune algorithm ควรมีอย่างน้อย

- raw IMU data ทุก sensor
- fused orientation outputs
- event annotations
- calibration metadata
- patient cohort metadata ที่ไม่ละเมิด privacy
- algorithm version และ configuration snapshot

## 13. Proposed Roadmap

### Phase 0: Baseline instrumentation and dataset readiness

deliverables

- define dataset format สำหรับ raw streams + events + metadata
- persist algorithm version และ quality flags ใน session records
- แยก replay path สำหรับ offline algorithm validation

### Phase 1: Sensor-mode architecture and orientation pipeline

deliverables

- preserve and formalize single-shank CSAV compatibility as the baseline mode
- รองรับ 2-sensor shank+thigh joint mode เป็น first kinematic expansion
- รองรับ left/right thigh + shank แบบครบ flow
- add sensor-to-segment calibration
- add quaternion-based fusion module
- expose fused segment orientation to runtime

### Phase 2: CSAV event detector for stroke gait

deliverables

- implement CSAV-informed detector
- ensure detector works in 1-sensor shank-only mode without requiring thigh data
- add corrective factors สำหรับ slow/pathological gait
- output per-event confidence
- benchmark เทียบกับ current detector

### Phase 3: Joint kinematics and drift-controlled spatial metrics

deliverables

- bilateral knee angle computation
- world-frame transformation
- gravity removal path
- stride reset + ZUPT tuning
- add session-level quality scoring

### Phase 4: Productized clinician workflow

deliverables

- doctor review screens สำหรับ event/kinematic summaries
- trend view สำหรับ follow-up
- export tools สำหรับ research validation
- alerting เมื่อ sensor quality ต่ำหรือ session incomplete

### Phase 5: Clinical validation and tuning

deliverables

- prospective validation protocol
- cohort-based performance report
- release criteria sign-off

## 14. Repo Implementation Map

ไฟล์หรือพื้นที่ที่น่าจะได้รับผลกระทบโดยตรง

| Area | Likely files |
| --- | --- |
| Sensor topology and transport | `DernDee_Web-app/shared/gateway/realtimeTransport.js`, `DernDee_Web-app/shared/gateway/realtimeSensorUtils.js` |
| Calibration flow | `DernDee_Web-app/apps/patient/src/components/Calibration.jsx`, related hooks/services |
| Orientation fusion and kinematics | `DernDee_Web-app/shared/gait/` |
| Event detection evolution | `DernDee_Web-app/shared/gait/gaitEventDetector.js`, new detector modules |
| Session persistence model | `DernDee_Web-app/shared/services/sessionService.js`, `supabase/migrations/` |
| Patient live dashboard | `DernDee_Web-app/shared/gait-dashboard/`, `DernDee_Web-app/apps/patient/src/components/GaitDashboard.jsx` |
| Doctor live and review flow | `DernDee_Web-app/apps/clinic/src/components/DoctorLiveGaitDashboard.jsx`, `DoctorAnalysisReview.jsx`, `DoctorPatientDetail.jsx` |

## 15. Open Decisions

ก่อนลงมือ implement แบบเต็ม ต้องตัดสินใจให้ชัดอย่างน้อยเรื่องต่อไปนี้

1. จะยืนยันใช้ ESP32 BLE node architecture ต่อ หรือจะสร้าง research rig แบบ wired/centralized เพิ่มอีกสายหนึ่ง
2. quaternion fusion จะรันบน firmware, frontend worker, หรือ hybrid path
3. gold-standard reference สำหรับ validation คืออะไรในบริบทจริงของทีม
4. จะ persist per-event rows เพิ่มจาก `gait_metrics` เดิมหรือจะขยาย schema เดิมด้วย `details/raw_payload`
5. KPI สำหรับ product release จะใช้ research benchmark หรือ release gate ที่ practical กว่า

## 16. Acceptance Criteria For The PRD

PRD นี้ถือว่าใช้งานได้เมื่อทีมยืนยันแล้วว่า

- product direction สอดคล้องกับ repo ปัจจุบัน
- architecture decision หลักไม่ย้อนจาก web-first / BLE-first path โดยไม่มีเหตุผลหนักแน่น
- validation plan ระบุ benchmark และ release gate แยกจากกันชัดเจน
- roadmap แปลงเป็น implementation tasks ได้จริง

## 17. Recommendation

ถ้าจะเริ่มพัฒนาตาม PRD นี้จริง ลำดับที่คุ้มที่สุดสำหรับ repo ปัจจุบันคือ

1. ทำ replayable dataset + algorithm versioning ก่อน
2. formalize sensor modes ให้ชัด: 1-shank CSAV baseline, 2-sensor joint mode, 4-sensor full mode
3. เพิ่ม orientation fusion และ calibration path สำหรับ mode ที่มี joint modeling
4. ค่อยแทน detector ปัจจุบันด้วย CSAV-informed stroke-aware detector
5. แล้วจึง productize clinician analytics และ validation exports

ลำดับนี้จะลดความเสี่ยงจากการเปลี่ยนหลายชั้นพร้อมกัน และช่วยให้เทียบ performance ก่อน/หลังของ algorithm ได้จริง