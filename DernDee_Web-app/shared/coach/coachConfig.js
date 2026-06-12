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

export const COACH_PROACTIVE_COOLDOWN_MS = 10_000;
export const COACH_PERIODIC_INTERVAL_MS = 50_000;
export const COACH_ENCOURAGEMENT_CYCLES = 6;

export const COACH_THRESHOLDS = {
  clearanceM: 0.02,
  stepLengthM: 0.2,
  cadenceSpm: 60,
};
