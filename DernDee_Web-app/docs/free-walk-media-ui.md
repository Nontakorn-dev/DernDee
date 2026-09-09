# Free Walk: ไมค์ วิดีโอ และหน้าจอ

สถานะล่าสุด 9 กันยายน 2026: **คืนการตอบด้วยเสียง Gemini Live โดยตรงตาม commit `f2456638` แล้ว** ไม่รอข้อความครบแล้วเรียก TTS ซ้ำ เสียงตอบคำถามจึงมาจาก Live ส่วนเสียงในคลิปยังเป็นไฟล์เดิม เนื้อหาเรื่องเส้นทาง TTS ด้านล่างเป็นประวัติการแก้ก่อนคืนระบบ

ปรับครั้งแรกวันที่ 8 กันยายน 2026

## สิ่งที่แก้

- Gemini Live รุ่น native audio ต้องใช้ `responseModalities: ['AUDIO']` พร้อม `outputAudioTranscription: {}` แม้จะใช้เฉพาะข้อความ ค่าก่อนหน้าเป็น TEXT ทำให้การเชื่อมต่อถูกปิด แก้ทั้ง client, dev token และ Supabase token config แล้ว
- WebSocket รอ `setupComplete` ก่อนรายงานพร้อมรับคำถาม และแสดงข้อผิดพลาดหาก setup ถูกปฏิเสธ
- Live รับเสียงไมค์และส่งคำถอดเสียงคำตอบ ส่วนเสียงตอบที่เปิดให้ฟังยังใช้ Gemini TTS ตาม config เดิม (`gemini-3.1-flash-tts-preview`, `Zubenelgenubi`) ไม่เล่นเสียง PCM ของ Live ซ้อนกัน รอ turnComplete ให้คำถอดเสียงครบก่อนพากย์
- ปุ่มไมค์ใช้ native click รองรับสัมผัส เมาส์ Enter และ Space ขอสิทธิ์ไมค์และปลุก AudioContext ตั้งแต่การกด ก่อนรอเครือข่าย แสดง “กำลังเปิดไมค์” จนเริ่มรับเสียงจริง
- ไม่ขอเปิดไมค์เองเมื่อเข้าหน้า ปิด track เมื่อส่งคำถาม และยกเลิก stream ที่เพิ่งได้รับหลังออกจากหน้า
- โค้ชที่ขาดการเชื่อมต่อแสดงสถานะจริง และลองสร้างการเชื่อมต่อใหม่เมื่อกดถาม
- วิดีโอคำตอบเล่นได้ระหว่างพักการเดิน โดยข้อมูลการเดินยังพักตามเดิม
- ตัววาด Packed MP4 ใช้ animation frame อ่านเฟรมตามเวลาแทนการพึ่ง video-frame callback ของวิดีโอซ่อนเพียงอย่างเดียว ยกเลิกคำสั่งสลับเก่าเมื่อเปลี่ยนคลิป/พัก และแสดงปุ่มเล่นซ้ำเมื่อโหลดไม่สำเร็จ
- เพิ่มภาพฉากแม่น้ำ โทนเขียว ปุ่มภาษาไทย สถานะระยะทาง เงาและคลื่นน้ำที่เบาลง หยุดแอนิเมชันฉากเมื่อพัก รองรับ prefers-reduced-motion

อ้างอิงข้อจำกัด Live: https://ai.google.dev/gemini-api/docs/live-api/capabilities

## วิธีตรวจ

รัน `npm run dev` แล้วเปิด `/tests/free-walk-preview.html` บนพอร์ตที่ Vite แจ้ง หน้านี้ใช้ component จริง แต่ไม่เปิดไมค์ ไม่ส่งข้อมูลให้ Gemini และไม่บันทึกเซสชัน

1. เล่นคลิปทักทาย/ใกล้ถึง สลับกลับ idle ดูภาพเคลื่อนไหวและการเปลี่ยนคลิป
2. สลับรูปแบบ WebM / Packed MP4 ตรวจภาพโปร่งใสทั้งสองรูปแบบ
3. กดพักแล้วสลับตอบคำถาม อวาตาร์ต้องยังเคลื่อนไหว ส่วนฉากพักอยู่
4. สลับขนาดมือถือ และจำลองก้าวเพื่อตรวจตำแหน่งบนฉาก
5. ปุ่มถามในหน้านี้ทดสอบปฏิสัมพันธ์เท่านั้น ไม่มีการบันทึกเสียง

ใน Free Walk จริง กด “ถามสเต็ปดี” อนุญาตไมค์ รอข้อความกำลังฟัง พูดแล้วกด “ส่งคำถาม” หากเปิดผ่าน IP ของเครื่องด้วย HTTP บนอุปกรณ์อื่น ไมค์อาจใช้ไม่ได้ ต้องใช้ HTTPS หรือ localhost บนอุปกรณ์นั้น

## ผลตรวจและขอบเขต

- ตรวจเบราว์เซอร์ Chrome: Live เปลี่ยนจากขาดการเชื่อมต่อเป็นพร้อม หลังแก้ modality และรอ setupComplete
- WebM และ Packed MP4 แสดงภาพได้ ตรวจเวลาของ TALK_SMALL เดินต่อระหว่างพัก และภาพปากเปลี่ยน
- ตรวจเลย์เอาต์แคบ 390px และการใช้ Enter กับปุ่มถามในหน้าทดสอบ
- เพิ่ม automated tests สำหรับ permission denial, concurrent capture, late stream cancellation, track release, setup acknowledgement/rejection และไม่เล่นเสียง Live ซ้อน TTS
- ยังไม่ได้ทดสอบเสียงพูดจริงจากไมค์ของผู้ใช้ไปจนถึงเสียงตอบ และยังไม่ได้ทดสอบเครื่อง iPhone/Bluefy จริง
- การเปลี่ยนไฟล์ Supabase function ยังไม่ได้ deploy หากใช้งาน production ต้องเผยแพร่ gemini-live-session พร้อม frontend เพื่อให้ token config ตรงกัน
- การใช้ TALK_SMALL เป็นคลิปวน ไม่ใช่การสร้างรูปปากตามหน่วยเสียงทุกคำ จึงไม่รับประกัน lip-sync ระดับคำพูด 100%

## ภาพและที่มา

สร้างด้วย built-in image generation tool (`imagegen`) ไม่ใช้ API/CLI ภายนอก

- ต้นฉบับ: `public/images/walk/river-garden.png`
- ใช้บนเว็บ: `public/images/walk/river-garden.webp` (แปลงชนิดไฟล์ด้วย ffmpeg เพื่อให้โหลดเร็ว)
- อ้างอิงภาพใน `WalkRiverScene.css`; เปลี่ยน URL ที่ background เพื่อใช้ฉากอื่น

Prompt ที่ใช้:

> Create a polished background asset for a Thai walking rehabilitation app, no text, no logos, no people, no stones or stepping platforms in the water. Calm stylized 3D illustration, soft matte clay materials, elegant pale turquoise river flowing from foreground bottom center to horizon upper center. Broad empty clean central water area occupies 70% width for UI overlay and animated stepping stones. Narrow lush sage green banks on far left and right edges, small rounded cream pebbles, graceful plants, subtle warm daylight, soft ambient shadows. Friendly sophisticated wellness visual, restrained mint teal cream palette, airy bright, no harsh contrast, no photorealism. Vertical portrait composition suitable as full mobile screen background, horizon near top 15%, camera looking slightly down river. Image only.


## แก้ไฟล์ภาพค้างเพิ่มเติม — 9 กันยายน 2026

พบว่า WebM ชุด 14–18 ทั้ง 11 ไฟล์มี video packets เพียง 3 packet (ถึงเวลา 0.083 วินาที) แต่เสียง/ความยาว container ประมาณ 6 วินาที การตรวจแค่ currentTime หรือ duration จึงไม่พบปัญหา

สร้าง WebM ใหม่จากภาพสีและ alpha ในไฟล์ `.ios.mp4` ที่มีเฟรมครบ โดยใช้เสียงจากไฟล์นั้น ปัจจุบันได้ครบ 144 เฟรมต่อคลิป ตรวจภาพ 12 ช่วงเวลาตลอดแต่ละคลิปแล้วแตกต่างกันครบทั้ง 12 ช่วง และตรวจคลิปใกล้ถึงในเบราว์เซอร์ช่วง 2 วินาทีเห็นยกมือและพูดตามปกติ

แก้สคริปต์ `pack-avatar-clip.py` ปิด encoder frame lag และใช้ `avatar_media.py` รวมเสียงโดยไม่ใช้ `-shortest` พร้อมตรวจจำนวน packet ก่อน/หลังรวมเสียงให้เท่ากัน เขียนผ่านไฟล์ชั่วคราวก่อนแทนไฟล์ปลายทาง หากตรวจไม่ผ่านจะเก็บไฟล์เดิมไว้ เปลี่ยน cache version ของชุด 14–18 เป็น `fullframes-20260909`

เพิ่ม `tests/avatar-media.test.mjs`: รวมเสียงสั้นกับวิดีโอยาวแล้วต้องรักษาเฟรมครบ และตรวจจำนวนเฟรมโดยประมาณเทียบความยาวของ WebM ทุกไฟล์ รันผ่าน `npm test` (เครื่องต้องมี ffmpeg, ffprobe และ python3; หากไม่มีจะรายงาน skip)


## คืนเส้นทางถาม–ตอบ Live — 9 กันยายน 2026

เทียบกับ `f2456638` พบว่าเส้นทางถามตอบถูกเปลี่ยนจากเล่น PCM ที่ Live ส่งมา เป็นทิ้ง PCM แล้วรอ transcription จบ ก่อนเรียก TTS เพิ่มอีกครั้ง การเปลี่ยนนี้ทำให้การตอบต้องพึ่งสองขั้นตอนและ timeout หลายจุด

คืนการเล่น native Live audio ทันทีที่ได้รับ packet และใช้ activityEnd เป็นการส่งคำถามไมค์จบ ไม่รอข้อความหรือเรียก TTS เสริม เก็บการแก้ permission/stream cleanup และการรอ setupComplete ไว้

สถานะพูดคงอยู่ระหว่างช่องว่าง packet จนได้รับ turnComplete และเสียงในคิวเล่นจบ อวาตาร์อิงสถานะเสียงจริงแม้คำตอบมาช้ากว่าข้อความแจ้งรอ จึงไม่ขึ้นอยู่กับธงรอคำถามที่อาจหมดเวลาไปแล้ว

เพิ่ม `/tests/coach-live-preview.html` สำหรับทดสอบข้อความ → Live → เสียงและอวาตาร์ด้วย component จริง (เฉพาะ dev, ไม่เปิดไมค์ ไม่บันทึกเซสชัน) ตรวจแล้วได้รับคำตอบจริง มี speaking และอวาตาร์พูด จากนั้นกลับ ready การรับเสียงจากไมค์จริงของผู้ใช้ยังไม่ได้ตรวจแบบ end-to-end

คลิป TALK_SMALL เป็นวิดีโอพูดวน การเริ่ม/หยุดตามเสียงไม่ได้หมายความว่ารูปปากตรงทุกพยางค์แบบ phoneme lip-sync


## คืนปุ่มเดิมและลดเสียงแทรก — 9 กันยายน 2026

คืนปุ่มจาก commit `f2456638`: Ask/Listening สีม่วง, Pause/Resume สีเหลือง และ End สีแดง พร้อมพฤติกรรมแตะเปิดแล้วแตะส่ง หรือกดค้างอย่างน้อย 450 ms แล้วปล่อยเพื่อส่ง เพิ่มการรอเปิดไมค์เสร็จก่อนประมวลผลการปล่อยปุ่ม เพื่อไม่ให้ capture ค้าง และคงการใช้คีย์บอร์ดไว้

Free Walk ไม่เรียก game audio unlock/keep-alive และไม่เล่นเอฟเฟกต์ลงก้าว 587/880 Hz อีก ฉากยังเคลื่อนไหวได้ตามเดิม เสียงเอฟเฟกต์ของเกมอื่นไม่ได้เปลี่ยน หยุดคลิปพูดก่อนรับไมค์เพื่อหลีกเลี่ยงเสียงซ้อน แก้ system instruction ทั้ง client/dev และ Supabase จากข้อความเท่านั้นเป็นเสียงพูดตามธรรมชาติ

ยังไม่ได้ยืนยันจากเสียงจริงของผู้ใช้ว่าเสียงตี๊ดมาจากเอฟเฟกต์นี้ทั้งหมด การแก้ข้างต้นตัดแหล่งเสียงแทรกที่พบในโค้ด และไม่ได้กรอง/ตัดย่านเสียงพูดของ Live โดยเดาสาเหตุ

## ภาพผู้ใช้และคืน input pipeline — 9 กันยายน 2026

ใช้ `senceVertical.jpg`/`senceH.jpg` ตามสัดส่วนพื้นที่ฉาก (CSS container query) ต่อภาพแบบสะท้อนแนวตั้งสลับกันเพื่อให้ขอบที่ชนกันเป็นขอบเดียวกัน วน 60 วินาที หยุดเมื่อพัก และปิดการเคลื่อนเมื่อผู้ใช้เลือก reduced motion ต้นฉบับไม่ได้ถูกแก้ไขหรืออ้างว่าทำ seamless ได้ตรงทุกพิกเซล

หิน `stone1.jpg` = ปกติ, `stone2.jpg` = เป้าหมายรูปเท้า, `stone3.jpg` = จุดยืน วางเป็น SVG image โดย clip ขอบวงรีเพื่อตัดพื้นลายตารางที่ติดมากับ JPG ออก เพิ่มเส้นสีเขียวรอบจุดยืน ขนาดหินคงที่เพื่อเข้ากับมุม top view

พบความต่างจาก commit `f2456638` เพิ่มเติม: Chrome เดิมใช้ SpeechRecognition แล้วส่งข้อความพร้อม gait context แต่ภายหลังเปลี่ยนเป็น raw microphone ทั้งหมด ปัจจุบันคืนเส้นทางเดิมบนเบราว์เซอร์ที่รองรับ ส่วน iOS/Bluefy ยังใช้ raw mic ตามเดิม เนื่องจากเส้นทางรู้จำเสียงบนอุปกรณ์นั้นไม่รองรับสม่ำเสมอ

คืน `audioPlayback.js` ให้ตรง HEAD เดิม และคืนข้อความ system instruction เดิมทั้ง client/dev และ Supabase token function แก้สถานะที่ค้าง speaking หลัง disarm/stop ซึ่งเคยทำให้ถามรอบถัดไปต้องรอจน timeout ตรวจ MIME ของ inline payload ก่อนเล่นเป็น PCM เพื่อไม่ถอดข้อมูลที่ไม่ใช่ PCM เป็นเสียง

เพิ่ม regression tests สำหรับรู้จำเสียง final/end ไม่ส่งซ้ำ ส่ง gait context และยกเลิกคำถามเมื่อรู้จำเสียงผิดพลาด รวมถึงหยุด playback แล้วกลับ ready

ยังไม่ยืนยันว่าเสียงตี๊ดของผู้ใช้หาย: การทดสอบอัตโนมัติและการตรวจภาพไม่ได้แทนการฟังเสียงบนลำโพงจริง ไม่ได้ deploy การแก้ production
