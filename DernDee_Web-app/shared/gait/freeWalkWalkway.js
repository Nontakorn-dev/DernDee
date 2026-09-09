/** Known Free Walk walkway length used to convert temporal gait into spatial metrics. */
export const FREE_WALK_WALKWAY_LENGTH_M = 5;

const DEFAULT_STEP_LENGTH_M = 0.5;
const NEAR_END_M = 4.2;
const TURN_YAW_DEG = 120;
const TURN_MIN_PROGRESS_M = 2.5;
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
    this.nearEndSpoken = false;
    this.turnSpoken = false;
    this.lastTurnAtMs = null;
    this.completedLegs = [];
  }

  ingestYaw(yawDeg, now = Date.now()) {
    if (!Number.isFinite(yawDeg)) {
      return null;
    }

    if (this.yawBaselineDeg == null) {
      this.yawBaselineDeg = yawDeg;
      this.lastYawDeg = yawDeg;
      return null;
    }

    this.lastYawDeg = yawDeg;
    const cooledDown = this.lastTurnAtMs == null || now - this.lastTurnAtMs >= TURN_COOLDOWN_MS;
    const turned = Math.abs(unwrapDeltaDeg(this.yawBaselineDeg, yawDeg)) >= TURN_YAW_DEG
      && this.progressM >= TURN_MIN_PROGRESS_M
      && cooledDown
      && !this.turnSpoken;

    if (!turned) {
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
      return this.snapshot();
    }

    const newSteps = stepCount - this.lastStepCount;
    this.lastStepCount = stepCount;
    this.legSteps += newSteps;
    if (this.legStartedAtMs == null) {
      this.legStartedAtMs = now;
    }

    // First leg is locked at 0.5 m. Later legs use 5 m / steps from the last completed leg.
    this.progressM = Math.min(
      this.lengthM + 0.5,
      this.progressM + (this.calibratedStepLengthM * newSteps),
    );
    this.beginNextLeg();

    const events = [];
    const completingByDistance = !this.turnSpoken
      && this.progressM >= this.lengthM * 0.96
      && (this.lastTurnAtMs == null || now - this.lastTurnAtMs >= TURN_COOLDOWN_MS);

    if (!this.nearEndSpoken && this.progressM >= NEAR_END_M && !completingByDistance) {
      this.nearEndSpoken = true;
      events.push({ type: 'near_end', ...this.snapshot() });
    }

    if (completingByDistance) {
      events.push(this.completeLeg('distance', now));
    }

    return {
      ...this.snapshot(),
      events: events.filter(Boolean),
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
      nearEnd: this.progressM >= NEAR_END_M,
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
