# Game: Stepping Stones (ภารกิจข้ามแม่น้ำ)

อัปเดตตามโค้ดใน repository นี้ ณ 2026-05-09

## 1. ภาพรวม

Stepping Stones เป็น gamification mode ที่ 4 ของ patient app ออกแบบมาเพื่อฝึก **ระยะก้าวเท้า (step length)** และ **การรับน้ำหนักขา (weight bearing / single-leg stance)** โดยใช้ metaphor ของการก้าวข้ามก้อนหินในแม่น้ำ

วัตถุประสงค์ทางคลินิก

- เพิ่ม step length ให้ถึง threshold ที่ physiotherapist กำหนด
- ฝึก single-leg stance hold ระยะสั้น ๆ หลังก้าว (900 ms)
- ให้ feedback ทันทีผ่านเสียงและ visual badge

ไฟล์หลัก

| ไฟล์ | หน้าที่ |
| --- | --- |
| `apps/patient/src/components/games/GameSteppingStones.jsx` | component หลัก ทั้ง logic และ UI |
| `apps/patient/src/components/games/GameSteppingStones.css` | animation และ river scene scenery |

Route: `/game/stepping-stones`

---

## 2. Game States

```
READY → PLAYING → PAUSED → PLAYING → COMPLETED
                         ↘
                          READY  (reset)
```

| State | คำอธิบาย |
| --- | --- |
| `READY` | รอเริ่ม ปุ่ม Start ปรากฏ |
| `PLAYING` | กำลังเล่น sensor กำลังส่งข้อมูล timer กำลังนับ |
| `PAUSED` | หยุดชั่วคราว timer หยุด sensor pipeline ยังรัน |
| `COMPLETED` | ครบ `totalTargets` ครั้ง session ถูก persist |

---

## 3. ค่าคงที่หลัก

| ชื่อ | ค่า default | ความหมาย |
| --- | --- | --- |
| `DEFAULT_TARGET_STEP_CM` | 35 cm | ระยะก้าวเป้าหมาย |
| `DEFAULT_TOTAL_TARGETS` | 10 | จำนวนก้อนหินทั้งหมด |
| `MIN_TARGET_STEP_CM` | 20 cm | ค่าต่ำสุดที่ตั้งได้ใน settings |
| `MAX_TARGET_STEP_CM` | 60 cm | ค่าสูงสุดที่ตั้งได้ใน settings |
| `LANDING_HOLD_MS` | 900 ms | ระยะเวลาที่ต้อง hold stance เพื่อนับ landing สำเร็จ |
| `LANDING_TIMEOUT_MS` | 2600 ms | หากไม่ hold ได้ใน 2.6 วิ จะยกเลิก landing attempt |
| `STEP_SUCCESS_RATIO` | 0.92 | step length ต้องถึง 92% ของ target จึงจะ trigger landing |
| `STEP_NEAR_RATIO` | 0.75 | 75–92% แสดง feedback "Almost there" |
| `SAFE_TARGET_THRESHOLD_CM` | 35 cm | ถ้า target ≤ 35 cm จะแสดง "Easy mode active" |
| `LANDING_STABLE_GYRO_NORM` | 0.24 rad/s | gyro norm ที่ถือว่า stable stance |
| `LANDING_STABLE_TILT_RATE` | 1.4 °/s | tilt rate สูงสุดที่ถือว่า stable |
| `FEEDBACK_RESET_MS` | 950 ms | หลัง feedback แสดง จะ reset กลับเป็น "Step to the green stone" ใน 950 ms |

---

## 4. Pipeline การตรวจจับก้าว

```
BLE Sensor (ESP32)
     │  WebSocket DATA message
     ▼
normalizeRealtimeSensorSample()
     │
     ├─► RealtimeStepDetector.update()   → detectorResult (phase, gyroNorm, tiltRate)
     │         ↓
     │   advanceLandingState()          → ตรวจสอบ stance stability → เพิ่ม weightShift %
     │
     └─► GaitProcessorClient.addSample() → onParams callback (ทุก ~400 ms)
               ↓
         handleStepMetrics()            → เปรียบเทียบ stepLength กับ target
               ↓
         activeLandingRef.current = ... → ตั้ง landing attempt ถ้า step ≥ 92%
```

### 4.1 handleStepMetrics

เรียกจาก `onParams` callback ของ `createGaitProcessorClient`

1. อ่าน `params.stepLength` (m) แปลงเป็น cm
2. ถ้า `stepLengthCm >= targetStepCmRef.current * 0.92` → สร้าง `activeLandingRef` และแสดง "Shift weight"
3. ถ้า 75–92% → แสดง "Almost there"
4. ถ้าน้อยกว่า 75% → แสดง "Try a longer step"

### 4.2 advanceLandingState

เรียกจาก `handleSensorData` ทุก sample ขณะมี `activeLandingRef`

1. ตรวจสอบว่า `detectorResult.phase === 'STANCE'` และ `gyroNorm ≤ 0.24` และ `|tiltRate| ≤ 1.4`
2. ถ้า stable → เริ่มนับ `stableStartedAtMs`, คำนวณ `progressRatio`, update `weightShiftPercent`
3. ถ้า `progressRatio >= 1` → เรียก `handleSuccessfulLanding()`
4. ถ้าไม่ stable → reset `stableStartedAtMs`, ลด weightShift ลง 5 จุด
5. ถ้าเกิน `LANDING_TIMEOUT_MS` → ยกเลิก landing attempt

### 4.3 handleSuccessfulLanding

1. clear landing state
2. set `weightShiftPercent = 100`
3. play landing sound (Web Audio API — triangle + sine oscillator)
4. trigger jump animation 450 ms
5. เพิ่ม `completedTargets`
6. ถ้าครบ `totalTargets` → COMPLETED, feedback "Great control"
7. ถ้ายังไม่ครบ → feedback "Perfect Landing" แล้ว reset กลับ "Step to the green stone" ใน 950 ms

---

## 5. UI Layout

### Mobile (< 768 px)
```
┌──────────────────────────┐
│ Header (logo + icons)    │
├──────────────────────────┤
│                          │
│   River Stage            │
│   (timer + stones +      │
│    scenery animations)   │
│                          │
├──────────────────────────┤
│ Feedback Badge           │
│ [Stride] [Weight] [Prog] │
│ Progress Bar             │
│ [Primary Btn][Stop Btn]  │
│ Footer sensor pills      │
└──────────────────────────┘
```

### Desktop (≥ 1200 px)
```
┌─────────────┬────────────────────┐
│ Header                           │
├─────────────┬────────────────────┤
│             │  Feedback Badge    │
│ River Stage │  3-column metrics  │
│  (flex-1)   │  Progress bar      │
│             │  Action buttons    │
│             │  Footer            │
└─────────────┴────────────────────┘
```

### Visual Elements ใน River Stage

- **Stone slots** — 5 ตำแหน่งที่ visible พร้อมกัน (sliding window ตาม `currentStoneNumber`)
- **Avatar (Footprints icon)** — แสดงบน current stone
- **Target stone** — pulse animation (`steppingStonePulseTarget`) + glow
- **Landing stone** — ripple animation + landing avatar สีเขียว
- **Water scenery** — pebble, pebble group, lily, reeds ตำแหน่งคงที่ตาม `WATER_SCENERY`

---

## 6. Settings Panel

เปิดจากไอคอน ⚙️ ที่ header

| Setting | Range | Default |
| --- | --- | --- |
| ระยะก้าวเป้าหมาย | 20–60 cm | 35 cm |
| จำนวนก้อนหิน | 6–14 | 10 |

**Presets ที่มี**

| Preset | target step | targets |
| --- | --- | --- |
| ง่าย | 28 cm | 8 |
| มาตรฐาน | 35 cm | 10 |
| ท้าทาย | 44 cm | 12 |

---

## 7. Session Persistence

ใช้ `usePersistedGatewaySession` เหมือนกับ 3 เกมอื่น

```js
sessionType: 'stepping_stones'
```

### buildSessionSummary (บันทึกลง `sessions` row)

| Field | มาจาก |
| --- | --- |
| `total_steps` | จาก GaitSessionAnalyzer หรือ completedTargets |
| `avg_speed_mps` | GaitSessionAnalyzer |
| `cadence_spm` | GaitSessionAnalyzer |
| `avg_step_length_m` | GaitSessionAnalyzer |
| `avg_stride_length_m` | GaitSessionAnalyzer |
| `avg_clearance_m` | GaitSessionAnalyzer |
| `symmetry_score` | mission progress % (0–100) |

### buildSessionDetails (บันทึกลง `sessions.details` JSON)

| Field | ความหมาย |
| --- | --- |
| `target_step_cm` | ระยะเป้าหมายที่ตั้งไว้ |
| `completed_landings` | จำนวนก้อนหินที่ข้ามสำเร็จ |
| `target_landings` | จำนวนก้อนหินทั้งหมด |
| `progress_percent` | เปอร์เซ็นต์ความสำเร็จ |
| `safe_easy_mode` | true ถ้า target ≤ 35 cm |

---

## 8. Feedback Tones

| Tone | สี | ข้อความที่ใช้ |
| --- | --- | --- |
| `sky` (default) | bg-white / text-emerald | "Step to the green stone", "Almost there" |
| `emerald` | bg-emerald-500 | "Shift weight", "Perfect Landing", "Great control" |
| `amber` | bg-amber-400 | "Hold balance", "Try a longer step" |
| `red` | bg-red-500 | (ปัจจุบันยังไม่มี flow ที่ trigger) |

---

## 9. Sensor Runtime

แต่ละ sensor key มี runtime แยก ประกอบด้วย

- `GaitProcessorClient` — worker-backed gait processor
- `RealtimeStepDetector` — real-time step phase detector
- `GaitSessionAnalyzer` — running average และ per-rep metrics

ถ้ามี sensor หลายตัวพร้อมกัน จะ prefer `sensorMount === 'shank'` และ limit ที่ `MAX_VISIBLE_SENSORS = 2`  
metrics ที่แสดงใน UI เป็นค่า average จากทุก active sensor

---

## 10. Stone Window Logic

```
visibleStoneNumbers = [currentStone, currentStone+1, ..., currentStone+4]
targetStoneNumber   = currentStone + 1   (ก้อนหินถัดไปที่ต้องก้าวไป)
currentStoneNumber  = completedTargets + 1
```

เมื่อ `completedTargets` เพิ่มขึ้น window จะเลื่อนขึ้นโดยอัตโนมัติ ทำให้เห็นก้อนหินข้างหน้าเสมอ

---

## 11. Known Constraints

- ต้องใช้ browser ที่รองรับ Web Bluetooth และ Web Audio API
- `RealtimeStepDetector` ต้องการ gyroscope data เพื่อตรวจสอบ stance stability จึงแนะนำ sensor mount ที่ shank
- การ pause ไม่หยุด sensor connection เพียงหยุดนับ session time และ ignore onParams events เท่านั้น
- ถ้าผู้ป่วยก้าวสำเร็จแต่ไม่ hold stance ครบ 900 ms ภายใน 2.6 วิ จะไม่นับ landing และต้องก้าวใหม่
