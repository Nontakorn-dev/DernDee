import {
  COACH_CUES,
  getAlertCoachCue,
  getAlertPraiseCue,
  getCoachCue,
} from './coachPhrases.js';

function toCm(meters) {
  return Number.isFinite(meters) ? Math.round(meters * 100) : null;
}

function detectTrend(previousStepLengthM, currentStepLengthM) {
  if (!Number.isFinite(previousStepLengthM) || !Number.isFinite(currentStepLengthM)) {
    return 'unknown';
  }

  const delta = currentStepLengthM - previousStepLengthM;
  if (delta <= -0.03) {
    return 'step_length_declining';
  }
  if (delta >= 0.03) {
    return 'step_length_improving';
  }
  return 'stable';
}

export function buildNaturalCoachPrompt({ intent, example = null, maxWords = 15 }) {
  const exampleLine = example
    ? `\nแนวประโยค (ปรับถ้อยคำให้สุภาพ เป็นทางการเล็กน้อย อบอุ่น ไม่ต้องอ่านตามตัวอักษร): ${example}`
    : '';

  const lengthRule = maxWords > 15
    ? `พูด 1 ถึง 2 ประโยค ให้ชัด ไม่เกิน ${maxWords} คำ ห้ามบรรยายยาว`
    : `พูดประโยคเดียวสั้นๆ ไม่เกิน ${maxWords} คำ`;

  return `พูดแบบ StepDee ภาษาไทยกลาง สำเนียงคนไทยแท้ สุภาพ เป็นทางการเล็กน้อย
${lengthRule} ทั้งคำตอบมี ครับ ได้ไม่เกิน 1 ครั้ง และต้องเป็นคำสุดท้ายเท่านั้น
ห้ามใส่ ครับ หลังคำชมหรือกลางประโยค ห้ามพูดตัวเลขยาว ห้ามถามกลับ
ห้ามโทนเพื่อนคุยเล่น ห้ามโทนหุ่นยนต์ ห้ามใช้คำว่า คนเก่ง
สิ่งที่ต้องสื่อ: ${intent}${exampleLine}`;
}

export function buildGreetingCoachPrompt() {
  const cue = getCoachCue('GREETING');
  return `ทักทายผู้ป่วยสั้นๆ ภาษาไทย น้ำเสียงสุภาพอบอุ่น เป็นทางการเล็กน้อย ประโยคเดียวไม่เกิน 12 คำ: ${cue.intent} (แนวประโยค: ${cue.example})`;
}

export function buildGaitCoachSnapshot(params, options = {}) {
  const previousStepLengthM = options.previousStepLengthM ?? null;
  const gait = params || {};

  return {
    event: options.event ?? 'gait_update',
    step_count: gait.stepCount ?? 0,
    step_length_cm: toCm(gait.stepLength),
    stride_length_cm: toCm(gait.strideLength),
    cadence_spm: Number.isFinite(gait.cadence) ? Math.round(gait.cadence) : null,
    walking_speed_mps: Number.isFinite(gait.walkingSpeed)
      ? Number(gait.walkingSpeed.toFixed(2))
      : null,
    clearance_cm: toCm(gait.clearance),
    stance_pct: Number.isFinite(gait.stancePct) ? Math.round(gait.stancePct) : null,
    swing_pct: Number.isFinite(gait.swingPct) ? Math.round(gait.swingPct) : null,
    trend: detectTrend(previousStepLengthM, gait.stepLength),
    session_elapsed_s: options.sessionElapsedS ?? 0,
    alert: options.alert ?? null,
    user_question: options.userQuestion ?? null,
    coaching_intent: options.coachingIntent ?? null,
    coaching_example: options.coachingExample ?? null,
    rest_variant: options.restVariant ?? null,
    cue_variant: options.cueVariant ?? 0,
    walkway_advice: options.walkwayAdvice ?? gait.walkwayAdvice ?? null,
  };
}

function formatMetric(value, suffix = '') {
  return Number.isFinite(value) ? `${value}${suffix}` : 'ไม่ทราบ';
}

export function buildGaitCoachPrompt(snapshot) {
  if (!snapshot) {
    return '';
  }

  if (snapshot.coaching_intent) {
    return buildNaturalCoachPrompt({
      intent: snapshot.coaching_intent,
      example: snapshot.coaching_example,
      maxWords: snapshot.event === 'turn_rest' ? 80 : 15,
    });
  }

  if (snapshot.user_question) {
    return `ผู้ป่วยถามว่า: "${snapshot.user_question}"
ตอบแบบ StepDee ภาษาไทยกลาง สำเนียงคนไทยแท้ สุภาพ เป็นทางการเล็กน้อย อบอุ่น
ตอบตรงคำถามทันที ห้ามทักทาย ห้ามสวัสดี ห้ามแนะนำตัว
ขึ้นต้นด้วยคำตอบเลย พูดช้าๆ ชัดๆ จังหวะเรียบ
ตอบสั้น 1 ประโยค ถ้าจำเป็นไม่เกิน 2 ประโยค รวมไม่เกิน 35 คำ แล้วจบทันที
ห้ามบรรยายยาว ห้ามยัดทุกหัวข้อ ห้ามทวนขั้นตอนที่ไม่ได้ถูกถาม
ใช้ความรู้ด้านล่างเฉพาะเมื่อตรงคำถาม: ติดเซนเซอร์หน้าแข้งเหนือข้อเท้าให้แน่น ตั้งศูนย์แล้วยืนตรงก่อนเดิน เดินไป-กลับบนทางตรงประมาณ 5 เมตร
ถ้าถามเรื่องเกมข้อเท้า: หน้าแข้งคู่กับหลังเท้าข้างเดียวกัน ถ้าถามเกมกระโดดหรือยกเข่า: ต้นขาคู่กับหน้าแข้งข้างเดียวกัน
เรื่องอื่น: 1 ประโยคแล้วพากลับมาเรื่องเดิน
ทั้งคำตอบมีคำว่า ครับ ได้ไม่เกิน 1 ครั้ง และต้องเป็นคำสุดท้ายของทั้งคำตอบเท่านั้น
ห้ามใส่ ครับ หลังคำชม ห้ามใส่กลางประโยค ห้ามใส่ทุกวรรค
ถูก: ดีมาก ค่อยๆ ยกเท้าขึ้นครับ
ผิด: ดีมากครับ ค่อยๆ ยกเท้านะครับ
ห้ามโทนเพื่อนคุยเล่น ห้ามโทนหุ่นยนต์ ห้ามคอลเซ็นเตอร์ ห้ามใช้คำว่า คนเก่ง ห้ามวินิจฉัยโรค
ห้ามเงียบ`;
  }

  if (snapshot.event === 'greeting') {
    return buildGreetingCoachPrompt();
  }

  if (snapshot.event === 'encouragement') {
    const cue = getCoachCue('ENCOURAGEMENT');
    return buildNaturalCoachPrompt({
      intent: cue.intent,
      example: cue.example,
    });
  }

  if (snapshot.event === 'periodic') {
    return buildNaturalCoachPrompt({
      intent: `สรุปสั้นๆ ว่าเดินได้ดีหรือควรปรับอะไร จากก้าวประมาณ ${formatMetric(snapshot.step_length_cm, 'ซม.')} และ cadence ${formatMetric(snapshot.cadence_spm)}`,
    });
  }

  if (snapshot.event === 'step_improved' && snapshot.alert) {
    const cue = getAlertPraiseCue(snapshot.alert);
    if (cue) {
      return buildNaturalCoachPrompt({
        intent: cue.intent,
        example: cue.example,
      });
    }
  }

  if (snapshot.event === 'idle_resume') {
    const cue = getCoachCue('IDLE_RESUME');
    return buildNaturalCoachPrompt({
      intent: cue.intent,
      example: cue.example,
    });
  }

  if (snapshot.alert) {
    const cue = getAlertCoachCue(snapshot.alert);
    if (cue) {
      return buildNaturalCoachPrompt({
        intent: cue.intent,
        example: cue.example,
      });
    }
  }

  return buildNaturalCoachPrompt({
    intent: 'ให้กำลังใจสั้นๆ ว่าเดินได้ดี',
    example: 'เดินต่อได้ดีมากครับ',
  });
}

export function isCoachGreetingSpeech(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  if (!compact || compact.length > 56) {
    return false;
  }

  return /^(สวัสดี|เดินดีบัดดี้)/.test(compact)
    || /ยินดีที่ได้รู้จัก/.test(compact)
    || /ผมเป็นผู้ช่วย/.test(compact)
    || /ผู้ช่วยของคุณ/.test(compact);
}

export function getCoachHintText(snapshot) {
  if (!snapshot) {
    return '';
  }

  if (snapshot.coaching_example) {
    return snapshot.coaching_example;
  }

  if (snapshot.event === 'greeting') {
    return getCoachCue('GREETING')?.example ?? '';
  }

  if (snapshot.event === 'encouragement') {
    return getCoachCue('ENCOURAGEMENT')?.example ?? '';
  }

  if (snapshot.event === 'idle_resume') {
    return getCoachCue('IDLE_RESUME')?.example ?? '';
  }

  if (snapshot.event === 'step_improved' && snapshot.alert) {
    return getAlertPraiseCue(snapshot.alert)?.example ?? '';
  }

  if (snapshot.alert) {
    return getAlertCoachCue(snapshot.alert)?.example ?? '';
  }

  return '';
}
