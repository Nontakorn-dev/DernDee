export const COACH_CUES = {
  GREETING: {
    intent: 'ทักทายผู้ป่วยอย่างอบอุ่น แนะนำตัวว่าเป็น StepDee ผู้ช่วยฝึกเดิน แล้วชวนให้เริ่มเดินบนลู่ห้าเมตรไป-กลับ',
    example: 'สวัสดีครับ ผมสเต็ปดี เริ่มเดินบนลู่ห้าเมตรได้เลยนะครับ',
  },
  IDLE_RESUME: {
    intent: 'เชิญชวนให้ผู้ป่วยเริ่มเดินต่ออย่างนุ่มนวล',
    example: 'พร้อมแล้วก็เริ่มเดินได้เลยนะครับ',
  },
  NEAR_END: {
    intent: 'ชมสั้นๆ แล้วบอกว่าใกล้ถึงปลายลู่ห้าเมตรแล้ว',
    example: 'เก่งมาก ใกล้ถึงแล้วครับ',
    variants: [
      'เก่งมาก ใกล้ถึงแล้วครับ',
      'อีกนิดเดียว ใกล้ถึงแล้วครับ',
      'เก่งมาก อีกไม่ไกลแล้วครับ',
    ],
  },
  TURN_REST: {
    intent: 'บอกให้กลับหลังหันแล้วพักก่อนได้เลย ห้ามพูดว่าถึงปลายทางแล้ว',
    example: 'กลับหลังหันแล้วพักก่อนได้เลยครับ',
    variants: [
      'กลับหลังหันแล้วพักก่อนได้เลยครับ',
    ],
  },
  WALKWAY_LONGER_STEP: {
    intent: 'หลังถึงปลายทางแล้ว ชวนให้ตอนเดินกลับลองก้าวยาวขึ้นอีกหน่อย จากความยาวก้าวที่คำนวณด้วยลู่ห้าเมตร',
    example: 'เดี๋ยวตอนเดินกลับลองก้าวให้ยาวขึ้นอีกหน่อยนะครับ',
    variants: [
      'เดี๋ยวตอนเดินกลับลองก้าวให้ยาวขึ้นอีกหน่อยนะครับ',
      'เดี๋ยวตอนเดินกลับลองก้าวให้กว้างขึ้นอีกนิดนะครับ',
      'เดี๋ยวตอนเดินกลับลองเหยียดก้าวให้ยาวขึ้นนะครับ',
    ],
  },
  WALKWAY_FASTER: {
    intent: 'หลังถึงปลายทางแล้ว ชวนให้ตอนเดินกลับลองเดินเร็วขึ้นอีกนิด จากจังหวะและเวลาที่ใช้เดินลู่ห้าเมตร',
    example: 'เดี๋ยวตอนเดินกลับลองเดินให้เร็วขึ้นอีกนิดนะครับ',
    variants: [
      'เดี๋ยวตอนเดินกลับลองเดินให้เร็วขึ้นอีกนิดนะครับ',
      'เดี๋ยวตอนเดินกลับลองเพิ่มจังหวะอีกนิดนะครับ',
      'เดี๋ยวตอนเดินกลับลองเดินให้คล่องขึ้นอีกหน่อยนะครับ',
    ],
  },
  WALKWAY_KEEP: {
    intent: 'หลังถึงปลายทางแล้ว ชมว่าเดินได้ดีจากลู่ห้าเมตร แล้วชวนให้ตอนเดินกลับลองทำแบบนี้ต่อไป',
    example: 'เดี๋ยวตอนเดินกลับลองรักษาแบบนี้ต่อไปได้เลยครับ',
    variants: [
      'เดี๋ยวตอนเดินกลับลองรักษาแบบนี้ต่อไปได้เลยครับ',
      'เดี๋ยวตอนเดินกลับลองเดินสม่ำเสมอแบบนี้ต่อไปนะครับ',
      'เดี๋ยวตอนเดินกลับลองทำแบบนี้ต่อไปได้เลยครับ',
    ],
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
    example: 'เยี่ยมมากครับ จังหวะดีขึ้นแล้ว พักสักครู่ก่อนเดินต่อนะ',
  },
  ENCOURAGEMENT: {
    intent: 'ให้กำลังใจสั้นๆ ว่าเดินได้ดี ทำต่อไปได้',
    example: 'เดินได้ดีมากเลยครับ ทำต่อไปนะ',
  },
  REST_BREAK_A: {
    intent: 'ชมว่าเดินได้ดี แล้วชวนให้พักสักครู่ก่อนเดินต่อ',
    example: 'ดีมากครับ พักสักครู่ก่อนก็ได้ครับ',
  },
  REST_BREAK_B: {
    intent: 'ชมว่าทำได้เก่ง แล้วชวนให้พักสักครู่ก่อนเดินต่อ',
    example: 'เก่งมากครับ พักสักครู่ก่อนก็ได้ครับ',
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

const WALKWAY_ADVICE_CUE_KEYS = {
  longer_step: 'WALKWAY_LONGER_STEP',
  faster: 'WALKWAY_FASTER',
  keep: 'WALKWAY_KEEP',
};

export function getCoachCue(key) {
  return COACH_CUES[key] ?? null;
}

export function getWalkwayAdviceCue(advice) {
  const key = WALKWAY_ADVICE_CUE_KEYS[advice];
  return key ? COACH_CUES[key] : COACH_CUES.WALKWAY_KEEP;
}

export function pickCueVariant(cue, lastIndex = -1) {
  if (!cue) {
    return { cue: null, index: lastIndex, example: '' };
  }

  const lines = Array.isArray(cue.variants) && cue.variants.length > 0
    ? cue.variants
    : [cue.example];
  const index = (lastIndex + 1) % lines.length;
  return {
    cue: {
      ...cue,
      example: lines[index],
    },
    index,
    example: lines[index],
  };
}

export function getAlertCoachCue(alert) {
  const key = ALERT_CUE_KEYS[alert];
  return key ? COACH_CUES[key] : null;
}

export function getAlertPraiseCue(alert) {
  const key = PRAISE_CUE_KEYS[alert];
  return key ? COACH_CUES[key] : null;
}
