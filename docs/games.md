# DernDee — เกมกายภาพบำบัด (Patient Games)

อัปเดตตามโค้ดใน repository นี้ ณ **2026-05-10** (commit `f7ee251e`)

Patient app มี 3 เกมที่ทำงานจาก IMU sensor (ESP32) ผ่าน WebSocket แบบ real-time

| เกม | Route | ไฟล์หลัก | วัตถุประสงค์คลินิก |
|---|---|---|---|
| Stepping Stones (ภารกิจข้ามแม่น้ำ) | `/game/stepping-stones` | `GameSteppingStones.jsx` | ฝึก step length + single-leg stance |
| High Stepper (ยกท้าวสูง) | `/game/clearance` | `GameClearance.jsx` | ฝึก vertical foot clearance |
| Magic Plate (แผ่นวิเศษ) | `/game/balance` | `GameBalance.jsx` | ฝึกการทรงตัวและย้าย CoP |

---

## เกมที่ 1 — Stepping Stones (ภารกิจข้ามแม่น้ำ)

### ภาพรวม

ผู้ป่วยก้าวเท้าจริง ๆ แล้ว hold single-leg stance เพื่อกระโดดข้ามก้อนหินในแม่น้ำ  
sensor วัด step length ผ่าน `GaitProcessorClient` และ stance stability ผ่าน `RealtimeStepDetector`

### ค่าคงที่หลัก

| ชื่อ | ค่า | ความหมาย |
|---|---|---|
| `DEFAULT_TARGET_STEP_CM` | 35 cm | ระยะก้าวเป้าหมายเริ่มต้น |
| `DEFAULT_TOTAL_TARGETS` | 10 | จำนวนก้อนหินทั้งหมด |
| `MIN_TARGET_STEP_CM` | 20 cm | ค่าต่ำสุดที่ตั้งได้ |
| `MAX_TARGET_STEP_CM` | 60 cm | ค่าสูงสุดที่ตั้งได้ |
| `LANDING_HOLD_MS` | 900 ms | ต้อง hold stance นานเท่านี้จึงนับ landing สำเร็จ |
| `LANDING_TIMEOUT_MS` | 2600 ms | หากไม่ hold ได้ใน 2.6 วินาที จะยกเลิก landing |
| `STEP_SUCCESS_RATIO` | 0.92 | step length ต้องถึง 92% ของ target จึง trigger landing |
| `STEP_NEAR_RATIO` | 0.75 | 75–92% → feedback "Almost there" |
| `LANDING_STABLE_GYRO_NORM` | 0.24 rad/s | gyro ต้องต่ำกว่านี้จึงถือว่า stable stance |
| `LANDING_STABLE_TILT_RATE` | 1.4 °/s | tilt rate สูงสุดที่ยอมรับ |
| `SAFE_TARGET_THRESHOLD_CM` | 35 cm | ถ้า target ≤ 35 cm → แสดง "Easy mode active" |

### Layout (Responsive)

- **Mobile / iPad portrait (< 1024 px)** — 3 ก้อนหิน (stone slots) ใน river stage
- **Desktop / MacBook (≥ 1024 px)** — 4 ก้อนหิน + right panel แสดง timer

Timer ปรากฏที่ **top ของ right panel** บน desktop (ซ่อนใน river stage)

### Pipeline

```
BLE Sensor (ESP32)
     │  WebSocket DATA
     ▼
normalizeRealtimeSensorSample()
     ├─► RealtimeStepDetector.update()     → phase, gyroNorm, tiltRate
     │         ↓
     │   advanceLandingState()            → ตรวจ stance stability → weightShift %
     └─► GaitProcessorClient.addSample()   → onParams (ทุก 400 ms)
               ↓
         handleStepMetrics()              → เปรียบ stepLength กับ target
               ↓
         activeLandingRef.current = ...   → สร้าง landing attempt ถ้า ≥ 92%
```

### การนับ landing สำเร็จ

1. `stepLength ≥ target × 0.92` → เริ่ม landing attempt, แสดง "Shift weight"
2. ทุก sample ขณะอยู่ในท่า stance: ตรวจ `gyroNorm ≤ 0.24` และ `tiltRate ≤ 1.4`
3. hold ครบ 900 ms → เรียก `handleSuccessfulLanding()`:
   - play landing sound (WebAudio triangle + sine)
   - หิน jump animation 450 ms
   - `completedTargets++`
4. ครบ `totalTargets` → state `COMPLETED`, persist session ไปยัง Supabase

### Session Data ที่ persist

`goal_progress_percent`, `total_steps`, `step_length_cm` (avg), `cadence_spm`, `symmetry_score`

---

## เกมที่ 2 — High Stepper / GameClearance (ยกท้าวสูง)

### ภาพรวม

ผู้ป่วยยกเท้าขึ้น-ลงซ้ำ ๆ ให้ถึงความสูงที่กำหนด  
gauge (แท่งแนวตั้ง) แสดงความสูงแบบ real-time ผ่าน `gatewayLiftEstimator.js`

### ค่าคงที่หลัก

| ชื่อ | ค่า | ความหมาย |
|---|---|---|
| `DEFAULT_TARGET_HEIGHT` | 5 cm | ความสูงเป้าหมายเริ่มต้น |
| `totalReps` (state) | 20 | จำนวนครั้งเป้าหมาย (ตั้งได้ใน settings) |
| `MAX_SCALE_HEIGHT` | 30 cm | cap สูงสุดของ logic |
| `displayMaxScale` | 20 cm (mobile) / 30 cm (desktop ≥ 1024 px) | scale ของ gauge บนหน้าจอ |
| `GATEWAY_HEIGHT_ALPHA` | 0.75 | สัดส่วน blending ระหว่าง estimator กับค่าเดิม |
| `MIN_REP_INTERVAL_MS` | 1800 ms | cooldown ขั้นต่ำระหว่าง rep |
| `VISUAL_FLOOR_SNAP_THRESHOLD` | 1.0 cm | snap gauge กลับ 0 เมื่อ height < 1 cm |
| `REP_RESET_THRESHOLD` | 3 cm | ต้องลง < 3 cm จึงจะ arm rep ถัดไป |

### Gauge Scale Markers

- Mobile: `[20, 15, 10, 5, 0]` cm
- Desktop: `[30, 25, 20, 15, 10, 5, 0]` cm
- Container height: `55vh` (mobile) / `70vh` (desktop), min `340px` / `500px`

### Pipeline การวัดความสูง

```
BLE Sensor (ESP32)
     │  raw ax/ay/az, gx/gy/gz (100 Hz)
     ▼
gatewayLiftEstimator.js (frontend port ของ gateway estimator)
     │  Madgwick AHRS → quaternion
     │  double integration ระหว่าง swing
     │  ZUPT + stance bias zeroing ป้องกัน drift
     ▼
GameClearance.jsx → handleSensorData()
     │  blending: GATEWAY_HEIGHT_ALPHA = 0.75
     │  5 cm/frame clamp (ป้องกัน spike)
     ▼
displayHeight useEffect (follow filter)
     │  upward followFactor = 0.75
     │  downward followFactor = 0.28
     ▼
gauge bar height %
```

### Rep State Machine

```
READY
  │  currentHeight ≥ targetHeight  AND  repCooldownElapsed (1800 ms)
  ▼
HIT_TARGET          ← play success sound (E5+B5 ding)
  │  currentHeight < REP_RESET_THRESHOLD (3 cm)
  │  AND repCooldownElapsed  AND repResetEligible
  ▼
READY               ← reps++
  │  reps ≥ totalReps
  ▼
COMPLETED           ← play mission complete fanfare (C5→E5→G5→C6)
                    ← auto-stop + overlay "Mission Complete"
```

### Drift Prevention (gatewayLiftEstimator.js — shank config)

| Parameter | ค่า | ความหมาย |
|---|---|---|
| `tiltRateThreshold` | 1.0 rad/s² | ตรวจ toe-off ด้วย tilt rate ต่ำ (รองรับผู้ป่วยยกช้า) |
| `minToeOffGyroNorm` | 0.15 rad/s | gyro ขั้นต่ำสำหรับ toe-off |
| `minSwingPeakGyroNorm` | 0.30 rad/s | gyro peak ขั้นต่ำระหว่าง swing |
| `minSwingDurationS` | 0.18 s | swing ต้องนานอย่างน้อยนี้ |
| `heelStrikeConfirmSamples` | 3 samples | จำนวน sample ยืนยัน heel-strike |
| `ACCEL_DEADBAND_Z` | 0.35 m/s² | deadband บน Z-accel ระหว่าง swing integration |
| `maxSwingZ` (shank) | 0.12 m | cap สูงสุดของ position Z |
| `POST_LANDING_COOLDOWN_MS` | 800 ms | บล็อก toe-off detection หลัง heel-strike (ป้องกัน double-rep) |
| Stance bias tracking | `stanceAccelBiasZ` + `stanceBiasSamples` | zeroing drift ระหว่าง stance |

### เสียง (WebAudio API)

| Event | เสียง |
|---|---|
| ยกครบ target height 1 ครั้ง | E5 + B5 ding (220 ms) |
| ครบ totalReps ทั้งหมด | C5 → E5 → G5 → C6 fanfare (1.2 s) |

ปุ่ม 🔊/🔇 toggle ใน header  
AudioContext init ใน `startSession()` (iOS user gesture requirement)

### Mission Complete Overlay

แสดงทับ gauge เมื่อครบ `totalReps`:
- ผล: reps / เวลา / ค่าเฉลี่ย cm
- ปุ่ม "เล่นอีกครั้ง"
- animation `fadeInScale`

### Session Data ที่ persist

`target_reps`, `target_height_cm`, `goal_progress_percent`, `avg_clearance_cm`, `stability_score`

---

## เกมที่ 3 — Magic Plate / GameBalance (แผ่นวิเศษ)

### ภาพรวม

ผู้ป่วยเอียงแผ่นให้ลูกบอล (bubble) ไปถึงเป้าหมายด้วย shank orientation จาก IMU  
มี 2 levels ที่เล่นต่อเนื่องในเซสชั่นเดียว

### Levels

| Level | ชื่อ | เงื่อนไขผ่าน | เงื่อนไขเปลี่ยน |
|---|---|---|---|
| Level 1 (STATIC_HOLD) | ยืนให้นิ่ง | hold bubble ในโซน A ≥ **10 วินาที** | ผ่านแล้วเปลี่ยนเป็น Level 2 อัตโนมัติ |
| Level 2 (TARGET_REACHING) | เก็บดาว | เก็บดาวครบ **6 ดวง** (3 ซ้าย + 3 ขวา) | สิ้นสุดเซสชั่น (Mission Complete) |

### ค่าคงที่หลัก

| ชื่อ | ค่า | ความหมาย |
|---|---|---|
| `STATIC_HOLD_GOAL_SECONDS` | 10 s | เป้าหมาย Level 1 |
| `TARGET_REACHING_GOAL_STARS` | 6 | จำนวนดาวเป้าหมาย Level 2 |

### Orientation Pipeline

```
BLE Sensor (ESP32)
     │  raw gyro + quaternion (shank preferred)
     ▼
GameBalance.jsx → handleSensorData()
     │  Madgwick-style orientation tracking
     │  yaw: raw body-yaw gyro bias ถูก capture ตอน Re-center
     │      low-pass + yaw-rate deadzone + still-only baseline adapt
     │  pitch/roll: quaternion-based angle
     ▼
bubble (x, y) position บน plate
```

### Auto-center Logic

- Armed ครั้งเดียวเมื่อเปิดเกม (`autoCenterArmedRef`)
- รอ sensor stable (ตรวจ `gyro_norm` และ delta quaternion)
- เรียก `startCalibration()` เดียวกับปุ่ม Re-center
- ไม่ re-arm หลังจาก reference quaternion ถูก apply

### Level 2 — Target Mission

- ดาว spawn ทีละ 1 ดวงใน 6 จุดที่กำหนด (2 คอลัมน์ ซ้าย-ขวา)
- queue shuffle ให้แต่ละรอบมีดาวซ้าย 3 ดวง + ขวา 3 ดวงพอดี
- หลังจับดาวได้ → bubble ต้อง return to center ก่อนดาวดวงต่อไปปรากฏ
- phase transitions: `TO_TARGET` → `RETURN_TO_CENTER` → `TO_TARGET` (repeat) → `COMPLETE`

### เสียง (WebAudio API) — ณ commit f7ee251e

| Event | เสียง |
|---|---|
| เก็บดาวได้ 1 ดวง (Level 2) | E5 + B5 ding (เหมือน High Stepper) |
| Level 2: เก็บครบ 6 ดวง | C5 → E5 → G5 → C6 fanfare |
| Level 1: hold ครบ 10 วินาที | C5 → E5 → G5 → C6 fanfare |

ปุ่ม 🔊/🔇 toggle ใน header (ข้างปุ่ม Settings)  
AudioContext init ใน `startSession()` (iOS requirement)

### Zone Classification

| โซน | ความหมาย |
|---|---|
| A (center) | เป้าหมาย Level 1 — ทรงตัวตรงกลาง |
| B (near) | ห่างจากศูนย์กลางระดับกลาง |
| C (far) | เอียงมาก |

สถิติ time-in-zone (A/B/C) ถูก track ตลอด session

### Status Announcements (Overlay)

| Trigger | ข้อความ |
|---|---|
| Level 1 → Level 2 | "Level 2 Unlocked" + "Collect 6 stars and return to center" |
| Mission Complete | "Mission Complete" + "All 6 stars collected" |

### Session Data ที่ persist

`symmetry_score`, `goal_progress_percent`, `time_in_zone_a`, `zone_stats`, `stars_collected`, `center_hold_goal_seconds`, `stars_goal`

---

## เกมที่ 4 — Rhythm Drummer (ตามจังหวะ)

### ภาพรวม

ผู้ป่วยก้าวเท้าให้ตรงกับ metronome beat ที่กำหนด  
`RealtimeStepDetector` ตรวจ heel-strike แล้ว judge ว่าลงเท้าตรงจังหวะแค่ไหน  
เล่นจนได้ **1,000 คะแนน** ถือว่าผ่าน

### ค่าคงที่หลัก

| ชื่อ | ค่า | ความหมาย |
|---|---|---|
| `DEFAULT_BPM` | 50 | BPM เริ่มต้น |
| `TARGET_SCORE` | 1000 | คะแนนเป้าหมาย |
| `RHYTHM_JUDGMENT_OFFSET_MS` | 200 ms | offset ขั้นต่ำชดเชย audio latency |
| BPM range (settings) | 40–120 | slider ตั้งได้ผ่าน settings |
| BPM presets | 45 / 50 / 60 | ปุ่ม preset ใน settings |

### Timing Windows (adaptive ตาม BPM)

คำนวณจาก `getTimingThresholds(bpm)` — ทุก window scale ตาม beat interval และมี hard cap:

| Grade | สูตร | Hard cap |
|---|---|---|
| Perfect | `beatInterval × 0.26` | 240 ms |
| Good | `beatInterval × 0.43` | 380 ms |
| Assist (On Beat) | `beatInterval × 0.55` | 500 ms |

ตัวอย่างที่ 50 BPM (beatInterval = 1200 ms):
- Perfect ≤ 312 ms → capped 240 ms
- Good ≤ 516 ms → capped 380 ms
- Assist ≤ 660 ms → capped 500 ms

### Scoring

| ผลการ judge | คะแนน | streak |
|---|---|---|
| Perfect | +30 | เพิ่ม |
| Good | +20 | เพิ่ม |
| On Beat (Assist) | +10 | เพิ่ม |
| Miss (เร็วไป / ช้าไป) | +0 | reset เป็น 0 |

นับแค่ **1 step ต่อ 1 beat** — step ซ้ำภายใน `beatInterval × 0.5` ของ beat เดิมจะถูก ignore

### Pipeline

```
BLE Sensor (ESP32)
     │  WebSocket DATA
     ▼
handleSensorData()
     │  สร้าง RealtimeStepDetector แยกต่อ sensor (รองรับ dual shank)
     ▼
detectorResult.event === 'HEEL_STRIKE'
     │
     ▼
resolveDetectedStepTimeMs()
     │  backdate timestamp ไปยัง candidate sample แรก
     │  (ไม่ใช้ final confirmation sample เพื่อไม่ให้ timing ดูช้า)
     ▼
registerDetectedStep(stepTimeMs)
     │  เปรียบ stepTimeMs กับ nextBeatTime และ lastBeatTime
     │  เลือก beat ที่ใกล้ที่สุด → judge
     ▼
feedback: Perfect / Good / On Beat / Miss
score++, streak++
```

### Metronome

- `startMetronome()` ตั้ง `setInterval` ที่ `beatInterval` ms
- แต่ละ tick: เล่นเสียง tick (WebAudio), pulse animation, `beatCount++`
- `nextBeatTimeRef` update ทุก tick เพื่อให้ `registerDetectedStep` คำนวณ error ได้แม่นยำ
- `judgmentOffsetMs` = audio latency จาก `AudioContext.baseLatency + outputLatency` (ขั้นต่ำ 200 ms)

### Beat Guide (real-time countdown)

`setInterval` ทุก 50 ms อ่าน `nextBeatTimeRef`:

| เวลาเหลือ | hint |
|---|---|
| ≤ perfect window | "ลงเท้าตอนนี้" |
| ≤ good window | "เตรียมลงเท้า" |
| ≤ assist window | "ตามเสียงไว้" |
| มากกว่า | "รอบีตถัดไป" |

Progress arc (circular) แสดง beat progress 0–100%

### Auto Complete

`useEffect` ดู `score` — เมื่อ `score >= TARGET_SCORE (1000)` → `COMPLETED` โดยอัตโนมัติ  
หรือกดปุ่ม Stop ด้วยตนเองก็ได้ (state = `COMPLETED` เช่นกัน แต่ `goalReached = false`)

### Completed Overlay

แสดงเมื่อ `gameState === COMPLETED`:
- ถ้า `goalReached`: "ทำคะแนนได้ {score} / 1000"
- ถ้าไม่ถึง: "คะแนนล่าสุด {score} / 1000"
- แสดง best streak, cadence, session time
- ปุ่ม "เล่นอีกครั้ง"

### เสียง (WebAudio API)

| Event | เสียง |
|---|---|
| Metronome beat (ทุก tick) | tick sound สั้น |
| Perfect step | success sound |

ปุ่ม 🔊/🔇 toggle ใน header  
AudioContext init ใน `startSession()` (iOS requirement)

### Session Data ที่ persist

`score`, `target_score`, `best_streak`, `cadence_spm`, `detected_steps`, `rhythm_progress` (%), `session_time_s`

---

## Shared Infrastructure

### IMU Signal Path (ทุกเกม)

```
ESP32 (ICM-20948 / MPU-6050)
     │ BLE → WebSocket Gateway (Python)
     │ หรือ Direct BLE (browser BLE API)
     ▼
realtimeTransport.js → WebSocket messages
     │  CONNECTED / DATA / SENSOR_STATUS / DISCONNECTED
     ▼
normalizeRealtimeSensorSample()   (realtimeSensorUtils.js)
     │  standardizes field names ระหว่าง legacy / new firmware
     ▼
Each game's handleSensorData()
```

### Audio Pattern (WebAudio API)

ทุกเกมใช้ pattern เดียวกัน:
- `audioContextRef = useRef(null)` init ใน `startSession()` (ต้องการ user gesture บน iOS)
- `playSuccessSound` — E5 (659 Hz) + B5 (987 Hz) ding 220 ms
- `playMissionCompleteSound` — C5→E5→G5→C6 fanfare ~1.2 s
- `soundEnabled` state + toggle button ใน header
- `useCallback(..., [soundEnabled])` สำหรับทั้งสองฟังก์ชัน

### Session Persistence

ทุกเกมใช้ `usePersistedGatewaySession` hook:
- buffer session data ใน IndexedDB ขณะ offline
- sync ไปยัง Supabase `sessions` table เมื่อ online
- `useOfflineSessionSync` จัดการ outbox retry

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | บทบาท |
|---|---|
| `shared/gait/gatewayLiftEstimator.js` | Madgwick AHRS + double integration สำหรับ High Stepper |
| `shared/gait/realtimeStepDetector.js` | heel-strike / toe-off detection สำหรับ Stepping Stones |
| `shared/gait/gaitProcessorClient.js` | step length / cadence pipeline (Web Worker) |
| `shared/gateway/realtimeTransport.js` | WebSocket connection + message routing |
| `shared/gateway/realtimeSensorUtils.js` | normalize sensor packet fields |
| `shared/hooks/usePersistedGatewaySession.js` | offline-first session persistence |
| `shared/hooks/useOfflineSessionSync.js` | sync IndexedDB outbox → Supabase |
