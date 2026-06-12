export const COACH_CUES = {
  GREETING: {
    intent: 'ทักทายผู้ป่วยอย่างอบอุ่น แนะนำตัวว่าเป็นเดินดีบัดดี้ ผู้ช่วยฝึกเดิน แล้วชวนให้เริ่มเดิน',
    example: 'สวัสดีครับ ผมเดินดีบัดดี้ เริ่มเดินได้เลยนะครับ',
  },
  IDLE_RESUME: {
    intent: 'เชิญชวนให้ผู้ป่วยเริ่มเดินต่ออย่างนุ่มนวล เหมือนเพื่อนคอยให้กำลังใจ',
    example: 'พร้อมแล้วก็เริ่มเดินได้เลยนะครับ',
  },
  SHORT_STEP_COACH: {
    intent: 'แนะนำอย่างอ่อนโยนว่าก้าวล่าสุดสั้นไปหน่อย ลองก้าวให้ยาวขึ้นอีกนิด',
    example: 'ลองก้าวให้ยาวขึ้นอีกหน่อยนะครับ',
  },
  LOW_CLEARANCE_COACH: {
    intent: 'แนะนำอย่างอ่อนโยนให้ยกเข่าสูงขึ้นอีกเล็กน้อยตอนเหยียบ',
    example: 'ลองยกเข่าให้สูงขึ้นอีกนิดนะครับ',
  },
  SLOW_CADENCE_COACH: {
    intent: 'แนะนำอย่างอ่อนโยนให้เดินเร็วขึ้นเล็กน้อย จังหวะช้าไปหน่อย',
    example: 'ลองเดินให้จังหวะเร็วขึ้นอีกนิดนะครับ',
  },
  SHORT_STEP_PRAISE: {
    intent: 'ชมเชยว่าก้าวยาวขึ้นแล้ว ทำได้ดีมาก แล้วบอกให้พักก้าวสักครู่ก่อนเดินต่อ',
    example: 'เก่งมากครับ ก้าวดีขึ้นแล้ว พักสักครู่แล้วค่อยเดินต่อนะ',
  },
  LOW_CLEARANCE_PRAISE: {
    intent: 'ชมเชยว่ายกเข่าได้ดีขึ้นแล้ว แล้วบอกให้พักก้าวสักครู่ก่อนเดินต่อ',
    example: 'ดีมากครับ ยกเข่าได้ดีขึ้นแล้ว พักสักครู่นะครับ',
  },
  SLOW_CADENCE_PRAISE: {
    intent: 'ชมเชยว่าจังหวะเดินดีขึ้นแล้ว แล้วบอกให้พักก้าวสักครู่ก่อนเดินต่อ',
    example: 'เยี่ยมเลยครับ จังหวะดีขึ้นแล้ว พักสักครู่ก่อนเดินต่อนะ',
  },
  ENCOURAGEMENT: {
    intent: 'ให้กำลังใจสั้นๆ ว่าเดินได้ดี ทำต่อไปได้',
    example: 'เดินได้ดีมากเลยครับ ทำต่อไปนะ',
  },
};

const ALERT_CUE_KEYS = {
  low_clearance: 'LOW_CLEARANCE_COACH',
  short_step: 'SHORT_STEP_COACH',
  slow_cadence: 'SLOW_CADENCE_COACH',
};

const PRAISE_CUE_KEYS = {
  low_clearance: 'LOW_CLEARANCE_PRAISE',
  short_step: 'SHORT_STEP_PRAISE',
  slow_cadence: 'SLOW_CADENCE_PRAISE',
};

export function getCoachCue(key) {
  return COACH_CUES[key] ?? null;
}

export function getAlertCoachCue(alert) {
  const key = ALERT_CUE_KEYS[alert];
  return key ? COACH_CUES[key] : null;
}

export function getAlertPraiseCue(alert) {
  const key = PRAISE_CUE_KEYS[alert];
  return key ? COACH_CUES[key] : null;
}
