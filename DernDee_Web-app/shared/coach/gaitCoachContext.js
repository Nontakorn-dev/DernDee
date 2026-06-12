const ALERT_HINTS_TH = {
  low_clearance: 'ยกเข่าให้สูงขึ้นอีกนิด',
  short_step: 'ลองก้าวให้ยาวขึ้น',
  slow_cadence: 'ลองเดินให้จังหวะเร็วขึ้นเล็กน้อย',
};

const PROMPT_PREFIX = 'ตอบภาษาไทยเท่านั้น สั้นไม่เกิน 12 คำ: ';

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

export function buildGaitCoachSnapshot(params, options = {}) {
  if (!params) {
    return null;
  }

  const previousStepLengthM = options.previousStepLengthM ?? null;

  return {
    event: options.event ?? 'gait_update',
    step_count: params.stepCount ?? 0,
    step_length_cm: toCm(params.stepLength),
    stride_length_cm: toCm(params.strideLength),
    cadence_spm: Number.isFinite(params.cadence) ? Math.round(params.cadence) : null,
    walking_speed_mps: Number.isFinite(params.walkingSpeed)
      ? Number(params.walkingSpeed.toFixed(2))
      : null,
    clearance_cm: toCm(params.clearance),
    stance_pct: Number.isFinite(params.stancePct) ? Math.round(params.stancePct) : null,
    swing_pct: Number.isFinite(params.swingPct) ? Math.round(params.swingPct) : null,
    trend: detectTrend(previousStepLengthM, params.stepLength),
    session_elapsed_s: options.sessionElapsedS ?? 0,
    alert: options.alert ?? null,
    user_question: options.userQuestion ?? null,
  };
}

function formatMetric(value, suffix = '') {
  return Number.isFinite(value) ? `${value}${suffix}` : 'ไม่ทราบ';
}

export function buildGaitCoachPrompt(snapshot) {
  if (!snapshot) {
    return '';
  }

  if (snapshot.user_question) {
    return `${PROMPT_PREFIX}ผู้ป่วยถามว่า "${snapshot.user_question}" — ตอบสั้นๆ เกี่ยวกับการเดิน`;
  }

  if (snapshot.event === 'encouragement') {
    return `${PROMPT_PREFIX}ชมเชยการเดินที่ดีต่อเนื่อง`;
  }

  if (snapshot.event === 'periodic') {
    return `${PROMPT_PREFIX}สรุปสั้นๆ ว่าเดินได้ดีหรือควรปรับอะไร (ก้าว ${formatMetric(snapshot.step_length_cm, 'ซม.')} cadence ${formatMetric(snapshot.cadence_spm)})`;
  }

  if (snapshot.alert && ALERT_HINTS_TH[snapshot.alert]) {
    return `${PROMPT_PREFIX}${ALERT_HINTS_TH[snapshot.alert]}`;
  }

  if (snapshot.event === 'metric_alert') {
    return `${PROMPT_PREFIX}แนะนำปรับท่าเดินเล็กน้อย`;
  }

  return `${PROMPT_PREFIX}ให้กำลังใจสั้นๆ`;
}
