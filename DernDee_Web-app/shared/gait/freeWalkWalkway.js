/** Known Free Walk walkway length used to convert temporal gait into spatial metrics. */
export const FREE_WALK_WALKWAY_LENGTH_M = 5;

const DEFAULT_STEP_LENGTH_M = 0.5;
/** Speak clip 14 once the walker is near the 5 m flag. */
export const WALKWAY_NEAR_END_M = 4.2;
/**
 * About-face vs walking: freeze the approach heading at the flag, then require
 * the shank to face ~180° away from that heading and stay there.
 * A single extra stride after clip 14 swings yaw a lot, but it comes back.
 */
export const WALKWAY_TURN_YAW_DEG = 155;
export const WALKWAY_TURN_MIN_PROGRESS_M = WALKWAY_NEAR_END_M;
export const WALKWAY_WALK_CONE_DEG = 70;
export const WALKWAY_TURN_AWAY_MS = 400;
export const WALKWAY_TURN_HOLD_MS = 500;
const WALKWAY_HEADING_EMA = 0.025;
const TURN_COOLDOWN_MS = 8_000;
const SHORT_STEP_M = 0.4;
const SLOW_CADENCE_SPM = 70;
const SLOW_SPEED_MPS = 0.5;

export const WALKWAY_ADVICE = {
  LONGER_STEP: 'longer_step',
  FASTER: 'faster',
  KEEP: 'keep',
};

/**
 * Spatial coaching from a completed 5 m leg: step length = 5 / steps,
 * cadence and speed from that same duration.
 */
export function selectWalkwayAdvice(leg = {}) {
  if (Number.isFinite(leg.stepLengthM) && leg.stepLengthM > 0 && leg.stepLengthM < SHORT_STEP_M) {
    return WALKWAY_ADVICE.LONGER_STEP;
  }

  if (
    (Number.isFinite(leg.cadenceSpm) && leg.cadenceSpm > 0 && leg.cadenceSpm < SLOW_CADENCE_SPM)
    || (Number.isFinite(leg.speedMps) && leg.speedMps > 0 && leg.speedMps < SLOW_SPEED_MPS)
  ) {
    return WALKWAY_ADVICE.FASTER;
  }

  return WALKWAY_ADVICE.KEEP;
}

function unwrapDeltaDeg(fromDeg, toDeg) {
  let delta = toDeg - fromDeg;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

/**
 * Tracks out-and-back progress on a fixed 5 m walkway and derives spatial
 * metrics from temporal counts once a leg completes.
 */
export class FreeWalkWalkwayTracker {
  constructor(options = {}) {
    this.lengthM = options.lengthM ?? FREE_WALK_WALKWAY_LENGTH_M;
    this.reset();
  }

  reset() {
    this.legIndex = 0;
    this.legSteps = 0;
    this.legStartedAtMs = null;
    this.progressM = 0;
    this.lastStepCount = 0;
    this.calibratedStepLengthM = DEFAULT_STEP_LENGTH_M;
    this.yawBaselineDeg = null;
    this.lastYawDeg = null;
    this.lastStepAtMs = null;
    this.walkHeadingDeg = null;
    this.walkHeadingFrozen = false;
    this.turnLeftWalkAtMs = null;
    this.turnHoldStartedAtMs = null;
    this.nearEndSpoken = false;
    this.turnSpoken = false;
    this.lastTurnAtMs = null;
    this.completedLegs = [];
  }

  followWalkHeading(yawDeg) {
    if (this.walkHeadingDeg == null) {
      this.walkHeadingDeg = yawDeg;
      return;
    }
    this.walkHeadingDeg += unwrapDeltaDeg(this.walkHeadingDeg, yawDeg) * WALKWAY_HEADING_EMA;
  }

  clearTurnWatch() {
    this.turnLeftWalkAtMs = null;
    this.turnHoldStartedAtMs = null;
  }

  ingestYaw(yawDeg, now = Date.now()) {
    if (!Number.isFinite(yawDeg)) {
      return null;
    }

    this.lastYawDeg = yawDeg;
    if (this.yawBaselineDeg == null) {
      this.yawBaselineDeg = yawDeg;
    }

    if (
      this.progressM < WALKWAY_TURN_MIN_PROGRESS_M
      || this.turnSpoken
      || this.lastStepAtMs == null
    ) {
      this.followWalkHeading(yawDeg);
      this.walkHeadingFrozen = false;
      this.clearTurnWatch();
      return null;
    }

    if (!this.walkHeadingFrozen) {
      if (this.walkHeadingDeg == null) {
        this.walkHeadingDeg = yawDeg;
      }
      this.walkHeadingFrozen = true;
    }

    const cooledDown = this.lastTurnAtMs == null || now - this.lastTurnAtMs >= TURN_COOLDOWN_MS;
    if (!cooledDown) {
      this.clearTurnWatch();
      return null;
    }

    const offset = Math.abs(unwrapDeltaDeg(this.walkHeadingDeg, yawDeg));
    if (offset < WALKWAY_WALK_CONE_DEG) {
      this.clearTurnWatch();
      return null;
    }

    if (this.turnLeftWalkAtMs == null) {
      this.turnLeftWalkAtMs = now;
    }

    if (offset < WALKWAY_TURN_YAW_DEG || now - this.turnLeftWalkAtMs < WALKWAY_TURN_AWAY_MS) {
      this.turnHoldStartedAtMs = null;
      return null;
    }

    if (this.turnHoldStartedAtMs == null) {
      this.turnHoldStartedAtMs = now;
      return null;
    }

    if (now - this.turnHoldStartedAtMs < WALKWAY_TURN_HOLD_MS) {
      return null;
    }

    return this.completeLeg('yaw_turn', now);
  }

  /**
   * @param {{ stepCount?: number, stepLength?: number, stepTime?: number }} params
   */
  ingestStep(params = {}, now = Date.now()) {
    const stepCount = Number(params.stepCount);
    if (!Number.isFinite(stepCount) || stepCount <= this.lastStepCount) {
      return { ...this.snapshot(), events: [] };
    }

    const newSteps = stepCount - this.lastStepCount;
    this.lastStepCount = stepCount;
    this.legSteps += newSteps;
    this.lastStepAtMs = now;
    if (this.legStartedAtMs == null) {
      this.legStartedAtMs = now;
    }

    // First leg is locked at 0.5 m. Later legs use 5 m / steps from the last completed leg.
    this.progressM = Math.min(
      this.lengthM,
      this.progressM + (this.calibratedStepLengthM * newSteps),
    );
    this.beginNextLeg();

    const events = [];
    if (!this.nearEndSpoken && this.progressM >= WALKWAY_NEAR_END_M) {
      this.nearEndSpoken = true;
      events.push({ type: 'near_end', ...this.snapshot() });
    }

    return {
      ...this.snapshot(),
      events,
    };
  }

  completeLeg(reason, now = Date.now()) {
    const durationS = this.legStartedAtMs
      ? Math.max(0.5, (now - this.legStartedAtMs) / 1000)
      : null;
    const steps = Math.max(1, this.legSteps);
    const stepLengthM = this.lengthM / steps;
    const cadenceSpm = durationS ? (steps / durationS) * 60 : null;
    const speedMps = durationS ? this.lengthM / durationS : null;
    const advice = selectWalkwayAdvice({ stepLengthM, cadenceSpm, speedMps });

    this.calibratedStepLengthM = stepLengthM;
    const leg = {
      type: 'turn_rest',
      reason,
      legIndex: this.legIndex,
      direction: this.legIndex % 2 === 0 ? 'out' : 'back',
      steps,
      durationS,
      stepLengthM,
      strideLengthM: stepLengthM * 2,
      cadenceSpm,
      speedMps,
      advice,
      walkwayLengthM: this.lengthM,
    };
    this.completedLegs.push(leg);

    this.legIndex += 1;
    this.legSteps = 0;
    this.legStartedAtMs = null;
    this.progressM = 0;
    this.nearEndSpoken = false;
    this.turnSpoken = true;
    this.lastTurnAtMs = now;
    this.yawBaselineDeg = this.lastYawDeg;
    this.walkHeadingDeg = this.lastYawDeg;
    this.walkHeadingFrozen = false;
    this.clearTurnWatch();

    return leg;
  }

  /** Call after the user starts walking the next leg so another turn can be detected. */
  beginNextLeg() {
    if (this.legSteps >= 2 || this.progressM >= 1) {
      this.turnSpoken = false;
    }
  }

  snapshot() {
    return {
      legIndex: this.legIndex,
      direction: this.legIndex % 2 === 0 ? 'out' : 'back',
      progressM: this.progressM,
      remainingM: Math.max(0, this.lengthM - this.progressM),
      walkwayLengthM: this.lengthM,
      calibratedStepLengthM: this.calibratedStepLengthM,
      legSteps: this.legSteps,
      completedLegs: this.completedLegs.slice(),
      nearEnd: this.progressM >= WALKWAY_NEAR_END_M,
    };
  }

  /** Overlay live params with walkway-calibrated spatial metrics when available. */
  applySpatialOverlay(params) {
    if (!params) {
      return params;
    }

    const lastLeg = this.completedLegs[this.completedLegs.length - 1];
    const stepLength = this.calibratedStepLengthM;
    return {
      ...params,
      stepLength,
      strideLength: stepLength * 2,
      cadence: lastLeg?.cadenceSpm ?? params.cadence,
      walkingSpeed: lastLeg?.speedMps
        ?? (Number.isFinite(params.cadence) && params.cadence > 0
          ? (stepLength * params.cadence) / 60
          : params.walkingSpeed),
      walkwayAdvice: lastLeg?.advice ?? null,
      walkwayProgressM: this.progressM,
      walkwayLengthM: this.lengthM,
      walkwayDirection: this.legIndex % 2 === 0 ? 'out' : 'back',
      spatialSource: 'walkway_5m_temporal',
    };
  }
}
