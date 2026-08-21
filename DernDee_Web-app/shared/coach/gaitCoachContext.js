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

export function buildNaturalCoachPrompt({ intent, example = null }) {
  const exampleLine = example
    ? `\nแนวประโยค (ปรับถ้อยคำให้ฟังสนทนาและอบอุ่น ไม่ต้องอ่านตามตัวอักษร): ${example}`
    : '';

  return `พูดภาษาไทยแบบโค้ชฟื้นฟู น้ำเสียงอบอุ่น เป็นกันเอง เหมือนเพื่อนคอยให้กำลังใจ
พูดประโยคเดียวสั้นๆ ไม่เกิน 15 คำ ห้ามพูดตัวเลขยาว ห้ามถามคำถามกลับ
ห้ามใช้คำว่า "คนเก่ง"
สิ่งที่ต้องสื่อ: ${intent}${exampleLine}`;
}

export function buildGreetingCoachPrompt() {
  const cue = getCoachCue('GREETING');
  return `ทักทายผู้ป่วยสั้นๆ ภาษาไทย น้ำเสียงอบอุ่น ประโยคเดียวไม่เกิน 12 คำ: ${cue.intent} (แนวประโยค: ${cue.example})`;
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
    });
  }

  if (snapshot.user_question) {
    return `ผู้ป่วยถามว่า: "${snapshot.user_question}"
ตอบเป็นภาษาไทย น้ำเสียงอบอุ่น เป็นกันเอง เหมือนเพื่อนโค้ชฝึกเดิน
ตอบตรงคำถามทันที ห้ามทักทาย ห้ามสวัสดี ห้ามแนะนำตัว ห้ามพูดว่าเดินดีบัดดี้ เพราะแอปทักทายไปแล้ว
ขึ้นต้นด้วยคำตอบเลย ห้ามขึ้นต้นด้วยสวัสดีหรือการแนะนำตัว
สั้นพอฟังชัด ไม่เกิน 2 ประโยค พูดช้าๆ ชัดๆ ห้ามพูดรัว
ห้ามพูดตัวเลขยาว ห้ามใช้คำว่า "คนเก่ง" ห้ามวินิจฉัยโรค
ถ้ายังไม่มีข้อมูลก้าวจากเซ็นเซอร์ ให้ตอบจากความรู้ทั่วไปเรื่องการเดินอย่างปลอดภัย ห้ามเงียบ`;
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
  if (!compact) {
    return false;
  }

  return /สวัสดี|เดินดีบัดดี้|ผู้ช่วยของคุณ|ยินดีที่ได้รู้จัก|ผมเป็นผู้ช่วย/.test(compact);
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
