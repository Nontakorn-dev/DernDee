import { OrientationTracker } from '../sensor/orientationTracker.js';
import { clamp, rad2deg } from './signalUtils.js';

const DEFAULT_MAX_PAIR_GAP_MS = 150;
const DEFAULT_SMOOTHING = 0.28;

function toTrackerSample(sample) {
  return {
    ax: sample.ax,
    ay: sample.ay,
    az: sample.az,
    gx: sample.gx,
    gy: sample.gy,
    gz: sample.gz,
    timestampMs: sample.timestampMs ?? sample.timestamp_ms ?? Date.now(),
  };
}

function vecDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecNorm(a) {
  return Math.hypot(a[0], a[1], a[2]) || 1;
}

function vecNormalize(a) {
  const n = vecNorm(a);
  return [a[0] / n, a[1] / n, a[2] / n];
}

/** Gravity direction in the sensor frame from the Madgwick quaternion. */
function gravityFromQuat(quaternion) {
  if (!quaternion || quaternion.length < 4) return null;
  const [w, x, y, z] = quaternion;
  return vecNormalize([
    2 * ((x * z) - (w * y)),
    2 * ((w * x) + (y * z)),
    2 * (0.5 - (x * x) - (y * y)),
  ]);
}

/**
 * Relative tilt between thigh and shank, from how gravity sits in each IMU.
 * This holds while the pose is held. Euler pitch difference does not: gyro
 * shows the bend, then accel correction dumps that rotation onto another axis.
 */
function relativeTiltDeg(thighQ, shankQ) {
  const gThigh = gravityFromQuat(thighQ);
  const gShank = gravityFromQuat(shankQ);
  if (!gThigh || !gShank) return null;
  return clamp(rad2deg(Math.acos(clamp(vecDot(gThigh, gShank), -1, 1))), 0, 150);
}

export class KneeAngleEstimator {
  constructor(options = {}) {
    this.maxPairGapMs = options.maxPairGapMs ?? DEFAULT_MAX_PAIR_GAP_MS;
    this.smoothing = options.smoothing ?? DEFAULT_SMOOTHING;
    this.autoPolarity = Boolean(options.autoPolarity);
    this.thighTracker = new OrientationTracker(options);
    this.shankTracker = new OrientationTracker(options);
    this.reset();
  }

  reset() {
    this.thighTracker.reset();
    this.shankTracker.reset();
    this.thighQ = null;
    this.shankQ = null;
    this.thighPitchDeg = null;
    this.shankPitchDeg = null;
    this.lastThighAt = 0;
    this.lastShankAt = 0;
    this.baselineFlexionDeg = 0;
    this.polarity = 1;
    this.polarityLocked = false;
    this.smoothedFlexionDeg = 0;
    this.ready = false;
  }

  calibrateToCurrentPose() {
    const rawFlexionDeg = this.computeRawFlexionDeg();
    if (rawFlexionDeg == null) {
      return false;
    }

    this.baselineFlexionDeg = rawFlexionDeg;
    this.polarity = 1;
    this.polarityLocked = false;
    this.smoothedFlexionDeg = 0;
    return true;
  }

  updateThigh(sample) {
    const result = this.thighTracker.update(toTrackerSample(sample));
    this.thighQ = result.quaternion;
    this.thighPitchDeg = result.pitchDeg;
    this.lastThighAt = Date.now();
    return this.computeFlexionDeg();
  }

  updateShank(sample) {
    const result = this.shankTracker.update(toTrackerSample(sample));
    this.shankQ = result.quaternion;
    this.shankPitchDeg = result.pitchDeg;
    this.lastShankAt = Date.now();
    return this.computeFlexionDeg();
  }

  computeRawFlexionDeg() {
    if (Math.abs(this.lastThighAt - this.lastShankAt) > this.maxPairGapMs) {
      return null;
    }

    const tiltDeg = relativeTiltDeg(this.thighQ, this.shankQ);
    if (tiltDeg != null) {
      return tiltDeg;
    }

    if (!Number.isFinite(this.thighPitchDeg) || !Number.isFinite(this.shankPitchDeg)) {
      return null;
    }

    return clamp(this.shankPitchDeg - this.thighPitchDeg, -150, 150);
  }

  computeFlexionDeg() {
    const rawFlexionDeg = this.computeRawFlexionDeg();
    if (rawFlexionDeg == null) {
      return null;
    }

    const delta = rawFlexionDeg - this.baselineFlexionDeg;
    if (this.autoPolarity && !this.polarityLocked && Math.abs(delta) >= 10) {
      this.polarity = delta >= 0 ? 1 : -1;
      this.polarityLocked = true;
    }

    const flexionDeg = clamp(this.polarity * delta, 0, 150);
    this.smoothedFlexionDeg += (flexionDeg - this.smoothedFlexionDeg) * this.smoothing;
    this.ready = true;
    return this.smoothedFlexionDeg;
  }

  getFlexionDeg() {
    return this.ready ? this.smoothedFlexionDeg : null;
  }

  isPairFresh(now = Date.now()) {
    return (
      this.lastThighAt > 0
      && this.lastShankAt > 0
      && Math.abs(this.lastThighAt - this.lastShankAt) <= this.maxPairGapMs
      && (now - this.lastThighAt) <= this.maxPairGapMs
      && (now - this.lastShankAt) <= this.maxPairGapMs
    );
  }
}
