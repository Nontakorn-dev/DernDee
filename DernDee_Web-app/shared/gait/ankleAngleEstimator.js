import { OrientationTracker } from '../sensor/orientationTracker.js';
import { clamp, rad2deg } from './signalUtils.js';

const DEFAULT_MAX_PAIR_GAP_MS = 180;
const DEFAULT_SMOOTHING = 0.28;
const MAX_ANKLE_DEG = 70;

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

function gravityFromQuat(quaternion) {
  if (!quaternion || quaternion.length < 4) return null;
  const [w, x, y, z] = quaternion;
  return vecNormalize([
    2 * ((x * z) - (w * y)),
    2 * ((w * x) + (y * z)),
    2 * (0.5 - (x * x) - (y * y)),
  ]);
}

function alignmentDeg(shankQ, footQ) {
  const gShank = gravityFromQuat(shankQ);
  const gFoot = gravityFromQuat(footQ);
  if (!gShank || !gFoot) return null;
  return rad2deg(Math.acos(clamp(vecDot(gShank, gFoot), -1, 1)));
}

/**
 * Sagittal ankle angle from shank + foot IMUs.
 * Standing alignment is the zero. Toes-up makes the two IMUs more aligned
 * (dorsiflexion). Toes-down makes them less aligned (plantarflexion).
 */
export class AnkleAngleEstimator {
  constructor(options = {}) {
    this.maxPairGapMs = options.maxPairGapMs ?? DEFAULT_MAX_PAIR_GAP_MS;
    this.smoothing = options.smoothing ?? DEFAULT_SMOOTHING;
    this.shankTracker = new OrientationTracker(options);
    this.footTracker = new OrientationTracker(options);
    this.reset();
  }

  reset() {
    this.shankTracker.reset();
    this.footTracker.reset();
    this.shankQ = null;
    this.footQ = null;
    this.shankPitchDeg = null;
    this.footPitchDeg = null;
    this.lastShankAt = 0;
    this.lastFootAt = 0;
    this.baselineAlignmentDeg = null;
    this.baselineRelativeDeg = 0;
    this.smoothedDorsiDeg = 0;
    this.smoothedPlantarDeg = 0;
    this.ready = false;
  }

  calibrateToCurrentPose() {
    if (!this.pairIsFresh()) {
      return false;
    }

    const alignment = alignmentDeg(this.shankQ, this.footQ);
    const relative = this.computePitchRelativeDeg();
    if (alignment == null && relative == null) {
      return false;
    }

    this.baselineAlignmentDeg = alignment;
    this.baselineRelativeDeg = relative ?? 0;
    this.smoothedDorsiDeg = 0;
    this.smoothedPlantarDeg = 0;
    return true;
  }

  updateShank(sample) {
    const result = this.shankTracker.update(toTrackerSample(sample));
    this.shankQ = result.quaternion;
    this.shankPitchDeg = result.pitchDeg;
    this.lastShankAt = Date.now();
    return this.computeDirected();
  }

  updateFoot(sample) {
    const result = this.footTracker.update(toTrackerSample(sample));
    this.footQ = result.quaternion;
    this.footPitchDeg = result.pitchDeg;
    this.lastFootAt = Date.now();
    return this.computeDirected();
  }

  pairIsFresh() {
    return (
      this.lastShankAt > 0
      && this.lastFootAt > 0
      && Math.abs(this.lastShankAt - this.lastFootAt) <= this.maxPairGapMs
    );
  }

  computePitchRelativeDeg() {
    if (!Number.isFinite(this.shankPitchDeg) || !Number.isFinite(this.footPitchDeg)) {
      return null;
    }
    return clamp(this.footPitchDeg - this.shankPitchDeg, -80, 80);
  }

  computeDirected() {
    if (!this.pairIsFresh()) {
      return null;
    }

    let dorsiDeg = 0;
    let plantarDeg = 0;
    const alignment = alignmentDeg(this.shankQ, this.footQ);
    if (alignment != null && this.baselineAlignmentDeg != null) {
      const delta = alignment - this.baselineAlignmentDeg;
      dorsiDeg = clamp(-delta, 0, MAX_ANKLE_DEG);
      plantarDeg = clamp(delta, 0, MAX_ANKLE_DEG);
    } else {
      const relative = this.computePitchRelativeDeg();
      if (relative == null) {
        return null;
      }
      const signed = relative - this.baselineRelativeDeg;
      dorsiDeg = clamp(-signed, 0, MAX_ANKLE_DEG);
      plantarDeg = clamp(signed, 0, MAX_ANKLE_DEG);
    }

    this.smoothedDorsiDeg += (dorsiDeg - this.smoothedDorsiDeg) * this.smoothing;
    this.smoothedPlantarDeg += (plantarDeg - this.smoothedPlantarDeg) * this.smoothing;
    this.ready = true;
    return {
      dorsiflexionDeg: this.smoothedDorsiDeg,
      plantarflexionDeg: this.smoothedPlantarDeg,
    };
  }

  getDorsiflexionDeg() {
    return this.ready ? this.smoothedDorsiDeg : null;
  }

  getPlantarflexionDeg() {
    return this.ready ? this.smoothedPlantarDeg : null;
  }

  getDirectedDeg(direction) {
    if (direction === 'plantarflexion') {
      return this.getPlantarflexionDeg();
    }
    return this.getDorsiflexionDeg();
  }

  isPairFresh(now = Date.now()) {
    return (
      this.lastShankAt > 0
      && this.lastFootAt > 0
      && Math.abs(this.lastShankAt - this.lastFootAt) <= this.maxPairGapMs
      && (now - this.lastShankAt) <= this.maxPairGapMs
      && (now - this.lastFootAt) <= this.maxPairGapMs
    );
  }
}
