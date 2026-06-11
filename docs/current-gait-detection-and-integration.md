# อัลกอริทึมตรวจจับก้าวและอินทิเกรตระยะทางที่ใช้อยู่ปัจจุบัน

เอกสารนี้อธิบายอัลกอริทึมที่รันอยู่จริงใน frontend runtime ตั้งแต่การตรวจจับ gait event ไปจนถึงการอินทิเกรตเพื่อหาระยะเชิงพื้นที่

ไฟล์อ้างอิง:

- [gaitProcessor.js](../DernDee_Web-app/shared/gait/gaitProcessor.js)
- [gaitEventDetector.js](../DernDee_Web-app/shared/gait/gaitEventDetector.js)
- [velocityIntegrator.js](../DernDee_Web-app/shared/gait/velocityIntegrator.js)
- [signalUtils.js](../DernDee_Web-app/shared/gait/signalUtils.js)

## 1. ขอบเขตของ runtime ปัจจุบัน

- sampling rate ถูก fix ที่ `100 Hz`
- buffer สำหรับวิเคราะห์เก็บข้อมูลย้อนหลังได้สูงสุด `12 วินาที`
- `analyze()` จะเริ่มทำงานก็ต่อเมื่อมีข้อมูลอย่างน้อย `3 วินาที`
- metric ที่ส่งให้ dashboard มาจาก cycle ล่าสุดที่ผ่านเงื่อนไขเท่านั้น

รายละเอียดสำคัญของ implementation ตอนนี้:

- แต่ละ HS จะ integrate ช่วง `HS → endpoint` หนึ่งครั้ง และตีความผลเป็น `stepLength`
- `strideLength = stepLength ก่อนหน้า + stepLength ล่าสุด` เมื่อมีก้าวก่อนหน้าในบัฟเฟอร์เดียวกัน
- `stepLength` ถูก clamp ไว้ที่ `[0.15, 0.80] m`

## 2. การเตรียมสัญญาณก่อนวิเคราะห์

ทุก sample ที่เข้ามาจะผ่าน `GaitProcessor.addSample()` ตามลำดับนี้

1. normalize timestamp ให้เป็นมิลลิวินาที
2. แปลง gyro ดิบเป็น deg/s ด้วย `raw / 16.4`
3. แปลง accel ดิบเป็น g ด้วย `raw / 4096`
4. คำนวณ accelerometer tilt angle ด้วย `atan2(-az, -ay)`
5. อัปเดต Kalman filter ด้วย gyro แกน x และ accelerometer angle
6. เก็บค่า `shankAngle` ที่ผ่านการ fuse แล้วลง buffer

ตอน `analyze()` รัน จะสร้าง array หลักดังนี้

- `angVelDeg`: angular velocity แกน x หน่วย deg/s
- `accelMagnitudeG`: `sqrt(ax^2 + ay^2 + az^2)` หน่วย g
- `ayG`, `azG`: acceleration แกน y และ z หน่วย g
- `shankAngle`: มุม shank ที่ได้จาก Kalman filter
- `timestamps`: เวลาแบบ relative วินาที นับจาก sample แรกใน buffer ปัจจุบัน

## 3. การตรวจจับ gait event

ส่วนนี้ทำใน `GaitEventDetector.detect()`

### 3.1 การ smooth สัญญาณ

- angular velocity ถูก smooth ด้วย moving average ขนาด `5` sample

### 3.2 การหา heel strike (HS)

ระบบหา HS จาก local minima ของ smoothed angular velocity แต่ขั้นตอนการยอมรับ candidate ไม่ได้ใช้ fixed threshold `-50 deg/s` แบบตรง ๆ แล้ว

- prominence ขั้นต่ำของ HS candidate: `80`
- ระยะห่างขั้นต่ำระหว่าง minima: `floor(0.6 * 100 * 0.8) = 48` sample
- หน้าต่างที่ใช้ดู envelope รอบ candidate ถูกขยายเป็นประมาณ `0.8 s`

จากนั้นระบบจะสร้าง adaptive HS threshold จาก 3 แหล่งข้อมูล

1. positive envelope รอบ candidate ปัจจุบัน
2. positive peak ของก้าวก่อนหน้าที่ระบบเคยยอมรับ
3. ขนาด HS minima ของก้าวก่อนหน้าที่ระบบเคยยอมรับ

threshold เชิงขนาดถูกคำนวณประมาณนี้

`adaptiveHsThresholdAbs = clamp(median(candidatePeak * 0.35, previousPeak * 0.35, previousHsAbs * 0.75), 18, 50)`

แล้ว candidate จะถูกยอมรับเป็น HS ถ้า

`abs(smoothed[idx]) >= adaptiveHsThresholdAbs`

ผลคือใน slow gait ที่ HS ลงไม่ถึง `-50 deg/s` ระบบยังมีโอกาสยอมรับ HS ได้ ถ้า envelope รอบข้างและประวัติของก้าวก่อนหน้าสนับสนุนว่ามันเป็นก้าวจริง

ข้อจำกัดที่ยังเหลือคือ detector ยังเริ่มจาก local minima ของ gyro อยู่เหมือนเดิม ไม่ได้เป็น contact detector โดยตรง

### 3.3 การสร้าง cycle

cycle ที่ยอมรับได้คือ HS สองจุดติดกัน

- `hsStart = heelStrikes[i]`
- `hsEnd = heelStrikes[i + 1]`
- `strideTime = time(hsEnd) - time(hsStart)`

cycle จะถูกเก็บไว้ก็ต่อเมื่อ

- `strideTime >= 0.6 s`
- `strideTime <= 4.0 s` ใน patient runtime ปัจจุบัน

การขยายเพดานนี้ทำไว้เพื่อไม่ให้ระบบ reject cycle จริงของผู้ป่วยที่เดินช้ามาก ใช้อุปกรณ์ช่วยเดิน หรือมีอาการเกร็ง/อ่อนแรงรุนแรง

### 3.4 การหา MSV

สำหรับแต่ละ HS-to-HS cycle จะหา MSV จาก zero crossing แรกที่ angular velocity เปลี่ยนจากค่าที่ไม่เป็นบวกไปเป็นค่าบวก ภายในช่วง

- เริ่มที่ `hsStart + 5 sample`
- จบที่ `hsStart + 40% ของจำนวน sample ใน stride`

### 3.5 การหา TO

TO ถูกหาในช่วงกลางไปทางท้ายของ cycle

- เริ่มค้นที่ `20%` ของ stride หลัง `hsStart`
- จบค้นที่ `80%` ของ stride หลัง `hsStart`
- detector คือ local minimum ตัวแรกในช่วงนั้น
- prominence ของ TO ใช้ `30`
- min distance ในการหา local minimum ใช้ `10` sample

search window ที่กว้างขึ้นนี้ตั้งใจให้ครอบคลุมผู้ป่วยที่มี TO เร็วกว่าคนปกติ เช่น เดินกะเผลกมาก หรือรีบถ่ายน้ำหนักกลับไปที่ขาข้างดี

### 3.6 การคำนวณ metric เชิงเวลา

ถ้าหา TO เจอ

- `stanceTime = HS -> TO`
- `swingTime = strideTime - stanceTime`
- cycle จะถูกติดป้ายว่า `temporalSource = measured-to`

ถ้าหา TO ไม่เจอ

- ถ้ามีก้าวก่อนหน้าที่เคยหา TO เจอ ระบบจะ reuse สัดส่วน stance ของก้าวนั้น
- cycle จะถูกติดป้ายว่า `temporalSource = previous-valid-ratio`
- ถ้ายังไม่เคยมีก้าวที่วัด TO ได้เลย ระบบจะตั้ง `stanceTime`, `swingTime`, `stancePct`, `swingPct` เป็น `null`
- cycle จะถูกติดป้ายว่า `temporalSource = unresolved`

จากนั้นคำนวณต่อเป็น

- ถ้ามีค่า temporal จริงหรือ inherited จากก้าวก่อน: `stancePct = stanceTime / strideTime * 100`
- ถ้ามีค่า temporal จริงหรือ inherited จากก้าวก่อน: `swingPct = swingTime / strideTime * 100`

สรุปคือ implementation ปัจจุบันไม่ fallback ไปใช้ healthy gait ratio `62/38` แล้ว

### 3.7 open last-cycle logic

หลัง HS สุดท้าย ระบบยังพยายามสร้าง cycle เปิดอีกหนึ่งรอบ ถ้าสัญญาณเข้าสู่ช่วงนิ่งจริง

- เกณฑ์ still: `|smoothed| <= 10 deg/s`
- ต้องนิ่งต่อเนื่องอย่างน้อย `0.2 s`
- open cycle นี้ต้องยาวอยู่ในช่วง `0.3 s` ถึง `4.0 s`
- ภายใน segment ยังต้องมี swing activity มากพอ คือ `max |smoothed| >= 20 deg/s`

ถ้าเงื่อนไขครบ ระบบจะสร้าง cycle เพิ่มอีกหนึ่งรอบ โดยให้จุดจบของ cycle อยู่ที่ปลายช่วง still แล้วค่อยหา MSV และ TO แบบเดียวกับ cycle ปกติ

## 4. การเลือก integration window

สำหรับแต่ละ HS-to-HS cycle ระบบใช้ `findStepIntegrationWindow()` เป็นเส้นทางเดียว

### 4.1 จุดเริ่ม integration

ระบบไม่เริ่มที่ HS impact โดยตรง แต่พยายามเริ่มหลังช่วงนิ่งสั้น ๆ หลัง `hsStart`

1. คำนวณ `adaptiveThreshold` จากช่วงหลัง swing peak
2. หา gyro quiet run ภายใน `0.40 s` หลัง `hsStart`
3. ถ้าเจอ quiet run: `integrationStartIdx = quietRun.endIdx + 1`
4. ถ้าไม่เจอ: `integrationStartIdx = hsStartIdx + 0.04 s`

### 4.2 จุดจบ integration

หลังกำหนดจุดเริ่มแล้ว ระบบหาจุดจบที่สมเหตุสมผลภายใน cycle

#### ขั้น A: หา positive peak หลัง HS

ใน HS-to-HS cycle ระบบจะหา angular velocity ที่เป็นบวกและมีค่าสูงสุด

#### ขั้น B: หา adaptive quiet threshold

จากช่วงหลัง peak ระบบจะหยิบค่า absolute angular velocity ที่เงียบที่สุด `20%` แรก แล้วคำนวณ

`adaptiveThreshold = clamp(noiseFloor + 2, 3, 12)`

#### ขั้น C: หา valley threshold

`valleyThreshold = clamp(max(adaptiveThreshold * 1.5, |peak| * 0.15), adaptiveThreshold, 40)`

#### ขั้น D: เลือก endpoint ตามลำดับความสำคัญ

fallback นี้จะเลือก "จุดที่ถูกต้องตัวสุดท้าย" ไม่ใช่ "จุดแรกที่ดูใช้ได้"

ลำดับคือ

1. local valley ตัวสุดท้ายหลัง peak ที่มีขนาดต่ำกว่า `valleyThreshold`
2. จุดเริ่มของ quiet run ตัวสุดท้ายที่ `|angVel| <= adaptiveThreshold` ต่อเนื่องอย่างน้อย `0.12 s`
3. sample ตัวสุดท้ายที่อยู่ใน threshold และ sample ถัดไปยังสนับสนุนการเข้า stance
4. positive-to-negative zero crossing ตัวสุดท้าย
5. sample ที่มี absolute angular velocity ต่ำสุดในช่วงค้นหา
6. `hsEnd` เป็น fallback สุดท้าย

นี่คือเหตุผลที่โค้ดปัจจุบันมีแนวโน้มจะไม่ตัด integration เร็วเกินไปเหมือน heuristic แบบ first-match เดิม

## 6. การอินทิเกรตเชิงพื้นที่

ส่วนนี้ทำใน `VelocityIntegrator.computeStrideMetrics()`

### 6.1 ข้อมูลที่ส่งเข้า integrator

สำหรับแต่ละ cycle, processor จะสร้างข้อมูลดังนี้

- `cycleAy` หน่วย `m/s^2`
- `cycleAz` หน่วย `m/s^2`
- `cycleAngles` หน่วย degree

การแปลงคือ

- `cycleAy = ayG * 9.81`
- `cycleAz = azG * 9.81`

และส่ง metadata ไปด้วยคือ

- `integrationStartIdx`
- `integrationEndIdx`

### 6.2 หมุน acceleration จาก sensor frame ไป world frame

ใช้ shank angle ปัจจุบัน `theta` เพื่อคำนวณ

- `aVert = -ay * cos(theta) + az * sin(theta)`
- `aHoriz = -ay * sin(theta) - az * cos(theta)`

จากนั้นลบ gravity ออกจากแกนตั้ง

- `aVertLinear = aVert - 9.81`

### 6.3 อินทิเกรต swing segment

runtime ปัจจุบันส่งเฉพาะช่วง swing ที่เลือกจาก `findStepIntegrationWindow()` เข้า integrator โดยตรง

### 6.4 อินทิเกรตครั้งที่หนึ่ง: acceleration เป็น velocity

velocity ถูกคำนวณด้วย trapezoidal integration

vertical velocity ก็ทำแบบเดียวกัน

### 6.5 drift correction แบบ linear

หลังอินทิเกรต swing segment แล้ว ระบบใช้ `correctDrift()` ลบ linear drift ระหว่าง sample แรกและ sample สุดท้ายของช่วง swing

### 6.7 อินทิเกรตครั้งที่สอง: velocity เป็น displacement

หลังแก้ drift แล้ว ระบบจะ

- อินทิเกรต horizontal velocity ไปเป็น horizontal displacement
- อินทิเกรต vertical velocity ไปเป็น vertical displacement

จากนั้นจะวัด spatial metric จาก stance boundary โดยตรง

- `strideLength = |mean displacement in right stance - mean displacement in left stance|`

สำหรับ clearance ระบบจะอิง swing peak เทียบกับ baseline ของ stance สองฝั่ง แทนการใช้ช่วงเต็มแบบลอย ๆ

ดังนั้น output สุดท้ายคือ

- `strideLength = |mean displacement right stance - mean displacement left stance|`
- `clearance = max(vertical displacement during swing) - stance baseline`

## 7. การ map ค่าไปเป็น metric บน dashboard

หลังได้ผลจาก integrator แล้ว processor จะคำนวณค่าที่ dashboard ใช้จริง

### 7.1 ค่ากลุ่ม spatial

- `stepLength` มาจากผล integrate ต่อ HS หนึ่งครั้ง และถูก clamp ไว้ในช่วง `[0.15, 0.80] m`
- `strideLength = stepLength ก่อนหน้า + stepLength ล่าสุด` และ clamp สูงสุดที่ `1.60 m`
- `clearance` ถูก clamp ไว้ในช่วง `[0, 0.3] m`

### 7.2 ค่ากลุ่ม temporal

- `cadence = (2 / strideTime) * 60`
- `stepTime = strideTime / 2`
- `walkingSpeed = strideLength / strideTime` ถ้ามี stride ครบสองก้าวแล้ว มิฉะนั้นใช้ `stepLength / stepTime`
- ถ้า `stancePct` หาได้: `doubleSupportPct = max(0, 2 * stancePct - 100)`
- ถ้า `stancePct` หาได้: `doubleSupport = strideTime * doubleSupportPct / 100`
- ถ้า `stancePct` เป็น `null`: `doubleSupport` จะเป็น `null` ตามไปด้วย

### 7.3 ขอบเขตของค่าที่แสดง

ระบบจะ publish เข้า `latestParams` และ `processedData` เฉพาะ cycle ล่าสุดที่ผ่านการยอมรับเท่านั้น

ดังนั้น dashboard ตอนนี้แสดงผลแบบ last-cycle estimate ไม่ใช่ค่าเฉลี่ยหลายก้าว

ถ้า temporal metric ของ cycle ล่าสุดยัง unresolved:

- value field ของ `stancePct` และ `swingPct` จะไม่แสดงเลขหลอกเป็น `0`
- label ของแถบ temporal จะแสดง `-` แทน
- bar width จะถูกปล่อยเป็น `0%` เพื่อไม่ทำให้ layout พัง

## 8. ทำไมบางก้าวยัง overshoot ได้

แม้จะเพิ่ม stance-aware integration แล้ว บางก้าวยังมีโอกาสยาวเกินจริงได้จากสาเหตุหลักเหล่านี้

1. HS detector ดีขึ้นจาก adaptive threshold แล้ว แต่ยังพึ่งรูปทรงของ gyro minima และ envelope อยู่ ดังนั้น cycle boundary ยังอาจเร็วหรือช้ากว่าความจริงได้
2. TO ยังหาแบบ local minimum search ธรรมดา ไม่ได้ใช้ contact model โดยตรง
3. แม้ stance gating จะ strict ขึ้นแล้ว การจับคู่ stance window กับ HS marker ยังยอมให้มีช่องว่างรอบ event ได้ จึงอาจได้ boundary ที่ใกล้เคียงแต่ไม่ตรง contact จริงเป๊ะ
4. ถ้า shank angle คลาดเคลื่อน การหมุน acceleration ไป world frame จะคลาดเคลื่อนตาม
5. `strideLength` ยังมาจากการบวกสองก้าวล่าสุด ไม่ใช่การ integrate ยาวตลอด HS-to-HS
6. integrator ตอนนี้ยังเป็น swing-only integration + linear drift correction ไม่ใช่ inertial navigation filter เต็มรูปแบบที่มี state estimation ของตำแหน่ง

ข้อสังเกตเพิ่มเติม:

- แม้ตอนนี้ TO fallback ไม่ใช้ healthy ratio แล้ว แต่ถ้าต้องยืม ratio จากก้าวก่อนหน้า ก้าวปัจจุบันก็ยังเป็น estimate ไม่ใช่ direct measurement
- แม้ HS threshold จะ adaptive แล้ว แต่ detector ยังต้องอาศัย minima shape และ prominence ของ gyro signal อยู่ ดังนั้น very slow gait ที่ envelope แบนมาก ๆ ยังมีโอกาสหลุด detection ได้

## 9. สรุปแบบสั้น

ถ้าจะสรุปให้สั้นที่สุด อัลกอริทึมปัจจุบันคือ

- ใช้ gyro minima + adaptive HS threshold จาก envelope และ previous-cycle extrema เพื่อหา HS
- ใช้ patient-friendly timing guard โดยยอมรับ stride ได้นานถึง `4.0 s`
- ใช้ TO search window กว้างขึ้นเป็น `20%` ถึง `80%` ของ stride
- ถ้าหา TO ไม่เจอ จะใช้ previous valid stance ratio หรือปล่อยเป็น `null` แทนการใส่ healthy ratio
- ใช้ strict stance-window detection เพื่อหา zero-velocity boundary ที่นิ่งกว่าเดิม
- อินทิเกรตทั้ง segment ที่คร่อม stance สองฝั่ง แล้วค่อยรายงานผลจาก swing และ stance boundaries
- ประเมิน bias จาก quiet windows สองฝั่ง
- แก้ velocity drift ด้วย stance-boundary-aware correction แล้วบังคับ velocity ใน stance windows ให้เป็นศูนย์

แนวนี้ดีกว่าการ double integrate แบบ HS-to-HS ตรง ๆ แต่ยังมีโอกาส overshoot ได้เมื่อ timing ของ event หรือมุมที่ใช้หมุน acceleration คลาดจากความจริงในบางก้าว