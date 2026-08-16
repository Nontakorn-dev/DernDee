export const LIVE_MODEL = 'gemini-3.1-flash-live-preview';

export const COACH_MODES = {
  LIVE: 'live',
  LEGACY: 'legacy',
};

export function getFreeWalkCoachMode() {
  const configured = import.meta.env.VITE_FREE_WALK_COACH_MODE;
  if (configured === COACH_MODES.LEGACY) {
    return COACH_MODES.LEGACY;
  }
  return COACH_MODES.LIVE;
}

export const COACH_PROACTIVE_COOLDOWN_MS = 15_000;
export const COACH_PERIODIC_INTERVAL_MS = 60_000;
export const COACH_ENCOURAGEMENT_CYCLES = 3;
export const COACH_REST_EVERY_STEPS = 3;
export const COACH_IDLE_NO_STEP_MS = 12_000;
export const COACH_REST_AFTER_PRAISE_MS = 7_000;
export const COACH_STEP_IMPROVE_DELTA_M = 0.03;

export const COACH_COOLDOWN_BY_TRIGGER_MS = {
  greeting: 0,
  metric_alert: 6_000,
  step_improved: 4_000,
  idle_resume: 12_000,
  encouragement: 15_000,
  rest_break: 0,
  periodic: 60_000,
  user_ask: 0,
};

export const COACH_THRESHOLDS = {
  clearanceM: 0.02,
  stepLengthM: 0.2,
  cadenceSpm: 60,
};
