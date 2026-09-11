export const WALKER_SHEET_FRAMES = 8;
export const WALKER_FRAMES_PER_STEP = 4;
export const WALKER_STEP_MS = 560;
export const WALKER_MAX_QUEUED_STEPS = 1;
export const WALKER_MOVE_EPSILON_M = 0.12;
export const WALKER_UP_SHEET = '/images/walk/walker-up.png?v=1';
export const WALKER_DOWN_SHEET = '/images/walk/walker-down.png?v=1';
export const WALKER_BACK_STILL = '/images/walk/walker-back.png';
export const WALKER_FRONT_STILL = '/images/walk/walker-front.png';

/** Queue a walk cycle only when the sprite actually moved along the 5 m path. */
export function queuedWalkerSteps(previousProgressM, nextProgressM, queued = 0) {
  if (nextProgressM + 0.05 < previousProgressM) {
    return 0;
  }
  if (nextProgressM <= previousProgressM + WALKER_MOVE_EPSILON_M) {
    return 0;
  }
  return Math.min(WALKER_MAX_QUEUED_STEPS, queued + 1);
}

export function nextWalkerFrame(frame) {
  return (Math.max(0, Math.round(frame)) + 1) % WALKER_SHEET_FRAMES;
}
