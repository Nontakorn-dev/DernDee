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

- หน่วยหลักที่ใช้คำนวณเชิงพื้นที่คือ cycle แบบ `HS-to-HS`
- ผล spatial ที่อินทิเกรตได้ถูกตีความเป็น `strideLength`
- ค่า `stepLength` ที่แสดงบน dashboard คำนวณเป็น `strideLength / 2`

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

## 4. การหา stance window แบบ explicit เพื่อใช้คุม integration

ส่วนนี้แยกจาก event detector และอยู่ใน `gaitProcessor.js` จุดประสงค์คือเลือก integration window ที่น่าเชื่อถือกว่าเดิม

### 4.1 สัญญาณที่ใช้หา stance

stance detector ใช้หลายสัญญาณพร้อมกัน เพื่อให้ window ที่ถูกยอมรับเป็น stance ของ shank runtime มีความนิ่งมากพอสำหรับการทำ ZUPT แบบเข้มขึ้น

- smoothed angular velocity
- rolling variance ของ acceleration magnitude
- rolling mean ของ acceleration magnitude
- angular acceleration ที่คำนวณจาก smoothed angular velocity

โดย acceleration magnitude คำนวณเป็น

`accelMagnitudeG = sqrt(ax^2 + ay^2 + az^2)`

### 4.2 rolling variance ของ acceleration magnitude

- ความยาวหน้าต่าง variance คือ `0.08 s`
- ที่ `100 Hz` จะเท่ากับประมาณ `8` sample

ระบบคำนวณ variance แบบ centered local window ให้ทุก sample

### 4.3 adaptive threshold ของ acceleration variance

โค้ดจะหยิบค่า variance ที่นิ่งที่สุด `20%` แรก แล้วหา median ของกลุ่มนั้น จากนั้นคำนวณ threshold เป็น

`accelVarianceThreshold = clamp(varianceFloor * 4 + 0.0008, 0.0008, 0.02)`

ข้อดีคือ threshold ด้าน acceleration จะปรับตาม noise floor ของข้อมูลช่วงนั้น

สำหรับ rolling mean ของ acceleration magnitude ระบบยังสร้าง threshold อีกตัวจากความคลาดเคลื่อนของค่า `|accelMagnitudeMean - 1g|` โดยใช้แนวคิด adaptive แบบเดียวกัน เพื่อกัน sample ที่แม้ variance ต่ำ แต่ magnitude ยังไม่กลับมาใกล้ gravity จริง

### 4.4 เงื่อนไขที่ sample จะถูกมองว่าเป็น stance candidate

sample จะนับเป็น stance candidate ก็ต่อเมื่อครบทุกข้อ

- `|smoothedAngVel| <= 10 deg/s`
- `rollingAccelVariance <= accelVarianceThreshold`
- `|angularAcceleration| <= 180 deg/s^2`
- `|rollingAccelMean - 1| <= accelMeanDeviationThreshold`

### 4.5 การสร้าง stance window

sample ที่ผ่านเงื่อนไขติดต่อกันจะถูกรวมเป็น window เดียวกัน

window จะถูกเก็บไว้ก็ต่อเมื่อยาวอย่างน้อย

- `0.10 s`
- ที่ `100 Hz` คือประมาณ `10` sample

แต่ระบบยังไม่ใช้ขอบของ window นี้ตรง ๆ ทันที

ภายใน candidate window แต่ละก้อน ระบบจะหา `strict core stance run` ที่นิ่งกว่าเดิมอีกชั้น โดยใช้เกณฑ์ที่เข้มขึ้น เช่น

- `|smoothedAngVel| <= 6 deg/s`
- `|angularAcceleration| <= 120 deg/s^2`
- variance และ accel-mean deviation ต้องต่ำกว่าค่า adaptive threshold แบบ tightened ลงอีก

จากนั้นจะเลือกช่วง strict run ที่ยาวที่สุดใน candidate window นั้นมาเป็น stance window สุดท้าย

สรุปคือขอบ stance ที่ถูกส่งต่อไปให้ integrator ไม่ใช่ quiet window แบบกว้าง ๆ แต่เป็น strict core window ที่พยายามตัด sample ชายขอบที่ยังมี motion ค้างอยู่ทิ้งไป

## 5. การเลือก integration window

processor จะลองใช้เส้นทาง stance-to-stance ก่อนเสมอ ถ้าทำไม่ได้ค่อย fallback ไปใช้ heuristic endpoint แบบเดิม

### 5.1 เส้นทางหลัก: stance-to-stance swing integration

สำหรับแต่ละ HS-to-HS cycle ระบบทำดังนี้

1. หา stance window ที่อยู่รอบ `hsStart` โดย prefer window ที่มาก่อน event
2. หา stance window ที่อยู่รอบ `hsEnd` โดย prefer window ที่มาหลัง event
3. ยอมให้ stance window ห่างจาก marker ได้ประมาณ `0.14 s`

ถ้าหา stance ได้ทั้งซ้ายและขวา

- `integrationStartIdx = leftStance.endIdx + 1`
- `integrationEndIdx = rightStance.startIdx - 1`

แปลว่า integration จริงจะรันเฉพาะช่วง swing ที่อยู่ระหว่าง quiet period สองฝั่ง

เส้นทางนี้จะถูกยอมรับก็ต่อเมื่อช่วง swing ยาวพอ

- minimum swing integration duration: `0.12 s`

segment ที่ส่งเข้า integrator จะกว้างกว่า integration window จริง เพราะรวมช่วง stance ซ้ายและขวาไปด้วย เพื่อให้ integrator มี sample สำหรับประเมิน bias จากช่วงนิ่งทั้งสองฝั่ง

การที่ stance windows ถูก trim เป็น strict core ก่อนขั้นนี้มีผลสำคัญ เพราะทำให้ `integrationStartIdx` และ `integrationEndIdx` ถูกผูกกับ boundary ที่นิ่งกว่าเดิม ไม่ใช่แค่ window ที่ variance ต่ำแบบหยาบ ๆ

### 5.2 เส้นทาง fallback: heuristic endpoint หลัง HS

ถ้า match stance-to-stance ไม่ได้ ระบบจะกลับไปใช้ `findStepIntegrationWindow()`

แนวคิดคือเริ่มจาก `hsStart` แล้วหาจุดจบที่สมเหตุสมผลภายใน cycle

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
- `stanceWindows` ที่ถูกแปลงให้เป็น local index ของ segment นั้นแล้ว

### 6.2 หมุน acceleration จาก sensor frame ไป world frame

ใช้ shank angle ปัจจุบัน `theta` เพื่อคำนวณ

- `aVert = -ay * cos(theta) + az * sin(theta)`
- `aHoriz = -ay * sin(theta) - az * cos(theta)`

จากนั้นลบ gravity ออกจากแกนตั้ง

- `aVertLinear = aVert - 9.81`

### 6.3 ประเมิน bias จาก stance windows

ถ้ามี stance windows เข้ามา integrator จะเก็บ sample ทั้งหมดภายใน windows เหล่านั้น แล้วคำนวณ

- `horizontalBias = mean(aHoriz during stance)`
- `verticalBias = mean(aVertLinear during stance)`

จากนั้น bias นี้จะถูกลบออกจากทั้ง segment ก่อน เพื่อให้ stance และ swing อยู่ใน reference เดียวกันตั้งแต่ต้น

### 6.4 อินทิเกรตทั้ง segment แต่รายงานผลจากช่วง swing

ถ้ามี stance windows สองฝั่งครบ ระบบจะอินทิเกรตทั้ง segment ที่มี

- left stance
- swing
- right stance

ไม่ใช่อินทิเกรต swing-only แบบลอย ๆ ตั้งแต่ต้นเหมือนเวอร์ชันก่อน

เหตุผลคือระบบต้องเห็น residual velocity ใน stance สองฝั่งจริงก่อน จึงจะทำ drift correction ที่อิง boundary ได้

อย่างไรก็ตาม metric ที่รายงานกลับออกมายังอิงช่วง swing ระหว่าง

- จาก `integrationStartIdx`
- ถึง `integrationEndIdx`

หลังจบ correction แล้ว จึงค่อยตัด slice ของช่วง swing ออกมาเป็น

- `swingHoriz`
- `swingVert`

### 6.5 อินทิเกรตครั้งที่หนึ่ง: acceleration เป็น velocity

velocity ถูกคำนวณด้วย trapezoidal integration

vertical velocity ก็ทำแบบเดียวกัน

### 6.6 drift correction ที่ผูกกับ stance boundary จริง

หลังอินทิเกรตทั้ง segment แล้ว โค้ดจะไม่ได้ใช้เส้นตรงจาก sample แรกไป sample สุดท้ายแบบเดิมเป็นหลัก แต่จะอิง stance boundary สองฝั่งแทน

ขั้นตอนคือ

1. หา mean velocity ใน left stance window
2. หา mean velocity ใน right stance window
3. หา mean sample index ของ stance window ทั้งสองฝั่ง
4. ฟิต baseline drift line ที่เชื่อม mean velocity ของสองฝั่งเข้าหากัน
5. ลบ baseline นี้ออกจาก velocity ทั้ง segment

พูดอีกแบบคือ drift correction ตอนนี้ผูกกับ `stance-boundary anchors` จริง ไม่ใช่กับต้น-ปลายของ integration slice แบบลอย ๆ

หลังจากนั้นระบบจะทำ strict ZUPT อีกชั้นโดย set velocity ภายใน stance windows ให้เป็น `0` ตรง ๆ

ผลคือ stance windows ทำหน้าที่เป็น zero-velocity boundary จริงมากขึ้น ไม่ใช่แค่เป็น sample สำหรับ bias estimation อย่างเดียว

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

- `strideLength` ถูก clamp ไว้ในช่วง `[0.15, 1.25] m`
- `stepLength = strideLength / 2`
- `clearance` ถูก clamp ไว้ในช่วง `[0, 0.3] m`

### 7.2 ค่ากลุ่ม temporal

- `cadence = (2 / strideTime) * 60`
- `stepTime = strideTime / 2`
- `walkingSpeed = strideLength / strideTime`
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
5. `stepLength = strideLength / 2` เป็นสมมติฐานว่ารอบ HS-to-HS นี้แบ่งเป็นสอง step ที่สมมาตรกัน
6. integrator ตอนนี้ยังเป็น bias-from-stance + linear endpoint drift correction ไม่ใช่ inertial navigation filter เต็มรูปแบบที่มี state estimation ของตำแหน่ง

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