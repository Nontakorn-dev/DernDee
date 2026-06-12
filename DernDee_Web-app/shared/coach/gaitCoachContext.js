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

export function buildGaitCoachPrompt(snapshot) {
  if (!snapshot) {
    return '';
  }

  if (snapshot.user_question) {
    return JSON.stringify({
      event: 'user_question',
      question: snapshot.user_question,
      gait_context: {
        step_count: snapshot.step_count,
        step_length_cm: snapshot.step_length_cm,
        cadence_spm: snapshot.cadence_spm,
        walking_speed_mps: snapshot.walking_speed_mps,
        clearance_cm: snapshot.clearance_cm,
      },
    });
  }

  return JSON.stringify(snapshot);
}
