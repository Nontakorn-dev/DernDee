import { rawGyroToDps } from './signalUtils.js';
import { STANCE_STABILITY_CONFIG } from './gaitRuntimeConfig.js';

/**
 * Auxiliary gyro stability monitor (PRD §8.4).
 * Used for landing/balance quality checks — not for gait event detection.
 * Step and phase events come exclusively from GaitProcessor / GaitEventDetector.
 */
export class StanceStabilityMonitor {
  constructor(options = {}) {
    this.config = { ...STANCE_STABILITY_CONFIG, ...options };
    this.reset();
  }

  reset() {
    this.gyroNormHistory = [];
    this.timestampHistory = [];
  }

  update(sample) {
    const timestampMs = sample.timestampMs ?? sample.timestamp_ms ?? Date.now();
    const gxRad = (rawGyroToDps(sample.gx) * Math.PI) / 180;
    const gyRad = (rawGyroToDps(sample.gy) * Math.PI) / 180;
    const gzRad = (rawGyroToDps(sample.gz) * Math.PI) / 180;
    const gyroNorm = Math.hypot(gxRad, gyRad, gzRad);

    let tiltRate = 0;
    if (this.gyroNormHistory.length >= 2 && this.timestampHistory.length >= 2) {
      const refNorm = this.gyroNormHistory[0];
      const refTimeMs = this.timestampHistory[0];
      const dtSeconds = (timestampMs - refTimeMs) / 1000;
      if (dtSeconds > 0) {
        tiltRate = (gyroNorm - refNorm) / dtSeconds;
      }
    }

    this.gyroNormHistory.push(gyroNorm);
    this.timestampHistory.push(timestampMs);

    const historySize = this.config.historySize || STANCE_STABILITY_CONFIG.historySize;
    if (this.gyroNormHistory.length > historySize) {
      this.gyroNormHistory.shift();
      this.timestampHistory.shift();
    }

    const isStable = gyroNorm <= this.config.gyroNormThreshold
      && Math.abs(tiltRate) <= this.config.tiltRateThreshold;

    return {
      isStable,
      gyroNorm,
      tiltRate,
    };
  }
}
