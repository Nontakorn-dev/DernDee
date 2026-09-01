import { OrientationTracker } from '../sensor/orientationTracker.js';
import { clamp } from './signalUtils.js';

const DEFAULT_MAX_PAIR_GAP_MS = 180;
const DEFAULT_SMOOTHING = 0.22;
const POLARITY_LOCK_DEG = 8;
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

/**
 * Sagittal ankle angle from shank + foot IMUs.
 * Relative pitch (foot − shank) minus a standing-flat baseline.
 * Dorsiflexion and plantarflexion are opposite signs of that relative angle.
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
    this.shankPitchDeg = null;
    this.footPitchDeg = null;
    this.lastShankAt = 0;
    this.lastFootAt = 0;
    this.baselineRelativeDeg = 0;
    this.dorsiSign = 1;
    this.signLocked = false;
    this.smoothedDorsiDeg = 0;
    this.smoothedPlantarDeg = 0;
    this.ready = false;
  }

  calibrateToCurrentPose() {
    const rawRelativeDeg = this.computeRawRelativeDeg();
    if (rawRelativeDeg == null) {
      return false;
    }

    this.baselineRelativeDeg = rawRelativeDeg;
    this.dorsiSign = 1;
    this.signLocked = false;
    this.smoothedDorsiDeg = 0;
    this.smoothedPlantarDeg = 0;
    return true;
  }

  updateShank(sample) {
    const result = this.shankTracker.update(toTrackerSample(sample));
    this.shankPitchDeg = result.pitchDeg;
    this.lastShankAt = Date.now();
    return this.computeDirected();
  }

  updateFoot(sample) {
    const result = this.footTracker.update(toTrackerSample(sample));
    this.footPitchDeg = result.pitchDeg;
    this.lastFootAt = Date.now();
    return this.computeDirected();
  }

  computeRawRelativeDeg() {
    if (!Number.isFinite(this.shankPitchDeg) || !Number.isFinite(this.footPitchDeg)) {
      return null;
    }

    if (Math.abs(this.lastShankAt - this.lastFootAt) > this.maxPairGapMs) {
      return null;
    }

    return clamp(this.footPitchDeg - this.shankPitchDeg, -80, 80);
  }

  learnSign(direction) {
    if (this.signLocked || !direction) {
      return;
    }

    const rawRelativeDeg = this.computeRawRelativeDeg();
    if (rawRelativeDeg == null) {
      return;
    }

    const signed = rawRelativeDeg - this.baselineRelativeDeg;
    if (Math.abs(signed) < POLARITY_LOCK_DEG) {
      return;
    }

    if (direction === 'plantarflexion') {
      this.dorsiSign = signed <= 0 ? 1 : -1;
    } else {
      this.dorsiSign = signed >= 0 ? 1 : -1;
    }
    this.signLocked = true;
    this.smoothedDorsiDeg = clamp(this.dorsiSign * signed, 0, MAX_ANKLE_DEG);
    this.smoothedPlantarDeg = clamp(-this.dorsiSign * signed, 0, MAX_ANKLE_DEG);
  }

  computeDirected() {
    const rawRelativeDeg = this.computeRawRelativeDeg();
    if (rawRelativeDeg == null) {
      return null;
    }

    const signed = rawRelativeDeg - this.baselineRelativeDeg;
    const dorsiDeg = clamp(this.dorsiSign * signed, 0, MAX_ANKLE_DEG);
    const plantarDeg = clamp(-this.dorsiSign * signed, 0, MAX_ANKLE_DEG);
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
    this.learnSign(direction === 'plantarflexion' ? 'plantarflexion' : 'dorsiflexion');
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
