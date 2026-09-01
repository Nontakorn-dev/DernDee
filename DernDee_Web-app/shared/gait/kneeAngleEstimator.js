import { OrientationTracker } from '../sensor/orientationTracker.js';
import { clamp } from './signalUtils.js';

const DEFAULT_MAX_PAIR_GAP_MS = 150;
const DEFAULT_SMOOTHING = 0.22;

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
    this.thighPitchDeg = result.pitchDeg;
    this.lastThighAt = Date.now();
    return this.computeFlexionDeg();
  }

  updateShank(sample) {
    const result = this.shankTracker.update(toTrackerSample(sample));
    this.shankPitchDeg = result.pitchDeg;
    this.lastShankAt = Date.now();
    return this.computeFlexionDeg();
  }

  computeRawFlexionDeg() {
    if (!Number.isFinite(this.thighPitchDeg) || !Number.isFinite(this.shankPitchDeg)) {
      return null;
    }

    if (Math.abs(this.lastThighAt - this.lastShankAt) > this.maxPairGapMs) {
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
