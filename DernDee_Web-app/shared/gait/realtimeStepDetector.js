import { rawGyroToDps } from './signalUtils.js';

export class RealtimeStepDetector {
  constructor(options = {}) {
    this.historySize = options.historySize || 5;
    this.setSensorMount(options.sensorMount || 'shank');
    this.reset();
  }

  setSensorMount(sensorMount = 'shank') {
    this.sensorMount = String(sensorMount || 'unknown').toLowerCase();

    this.gyroThreshold = 0.2;
    this.tiltRateThreshold = 5.24;
    this.minToeOffGyroNorm = 0.25;
    this.minSwingPeakGyroNorm = 0.5;
    this.minStanceDurationS = 0.08;
    this.minSwingDurationS = 0.18;
    this.toeOffConfirmSamples = 2;
    this.heelStrikeConfirmSamples = 3;

    if (this.sensorMount === 'shank') {
      this.gyroThreshold = 0.18;
      this.minToeOffGyroNorm = 0.30;
      this.minSwingPeakGyroNorm = 0.75;
      this.minStanceDurationS = 0.10;
      this.minSwingDurationS = 0.24;
      this.toeOffConfirmSamples = 2;
      this.heelStrikeConfirmSamples = 4;
    }
  }

  reset() {
    this.phase = 'STANCE';
    this.stanceStartTimeMs = null;
    this.swingStartTimeMs = null;
    this.swingPeakGyroNorm = 0;
    this.toeOffCandidateCount = 0;
    this.toeOffCandidateStartTimeMs = null;
    this.heelStrikeCandidateCount = 0;
    this.heelStrikeCandidateStartTimeMs = null;
    this.gyroNormHistory = [];
    this.timestampHistory = [];
  }

  static durationSeconds(startMs, endMs) {
    if (startMs === null || startMs === undefined) {
      return 0;
    }
    return Math.max(0, (endMs - startMs) / 1000);
  }

  update(sample) {
    const timestampMs = sample.timestampMs ?? Date.now();
    const gxRad = rawGyroToDps(sample.gx) * Math.PI / 180;
    const gyRad = rawGyroToDps(sample.gy) * Math.PI / 180;
    const gzRad = rawGyroToDps(sample.gz) * Math.PI / 180;
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
    if (this.gyroNormHistory.length > this.historySize) {
      this.gyroNormHistory.shift();
      this.timestampHistory.shift();
    }

    let event = null;
    let eventTimestampMs = null;

    if (this.phase === 'STANCE') {
      if (this.stanceStartTimeMs === null) {
        this.stanceStartTimeMs = timestampMs;
      }

      const stanceDurationS = RealtimeStepDetector.durationSeconds(this.stanceStartTimeMs, timestampMs);
      const toeOffCandidate = (
        stanceDurationS >= this.minStanceDurationS
        && tiltRate > this.tiltRateThreshold
        && gyroNorm >= this.minToeOffGyroNorm
      );

      if (toeOffCandidate && this.toeOffCandidateCount === 0) {
        this.toeOffCandidateStartTimeMs = timestampMs;
      } else if (!toeOffCandidate) {
        this.toeOffCandidateStartTimeMs = null;
      }

      this.toeOffCandidateCount = toeOffCandidate ? this.toeOffCandidateCount + 1 : 0;
      this.heelStrikeCandidateCount = 0;
      this.heelStrikeCandidateStartTimeMs = null;

      if (this.toeOffCandidateCount >= this.toeOffConfirmSamples) {
        this.phase = 'SWING';
        this.swingStartTimeMs = timestampMs;
        this.swingPeakGyroNorm = gyroNorm;
        this.toeOffCandidateCount = 0;
        event = 'TOE_OFF';
        eventTimestampMs = this.toeOffCandidateStartTimeMs ?? timestampMs;
        this.toeOffCandidateStartTimeMs = null;
      }
    } else {
      this.swingPeakGyroNorm = Math.max(this.swingPeakGyroNorm, gyroNorm);
      const swingDurationS = RealtimeStepDetector.durationSeconds(this.swingStartTimeMs, timestampMs);
      const heelStrikeCandidate = (
        swingDurationS >= this.minSwingDurationS
        && this.swingPeakGyroNorm >= this.minSwingPeakGyroNorm
        && gyroNorm < this.gyroThreshold
      );

      if (heelStrikeCandidate && this.heelStrikeCandidateCount === 0) {
        this.heelStrikeCandidateStartTimeMs = timestampMs;
      } else if (!heelStrikeCandidate) {
        this.heelStrikeCandidateStartTimeMs = null;
      }

      this.heelStrikeCandidateCount = heelStrikeCandidate ? this.heelStrikeCandidateCount + 1 : 0;
      this.toeOffCandidateCount = 0;
      this.toeOffCandidateStartTimeMs = null;

      if (this.heelStrikeCandidateCount >= this.heelStrikeConfirmSamples) {
        this.phase = 'STANCE';
        this.stanceStartTimeMs = timestampMs;
        this.heelStrikeCandidateCount = 0;
        this.swingPeakGyroNorm = 0;
        event = 'HEEL_STRIKE';
        eventTimestampMs = this.heelStrikeCandidateStartTimeMs ?? timestampMs;
        this.heelStrikeCandidateStartTimeMs = null;
      }
    }

    return {
      event,
      eventTimestampMs,
      phase: this.phase,
      debug: {
        gyroNorm,
        tiltRate,
        swingPeakGyroNorm: this.swingPeakGyroNorm,
        toeOffCandidates: this.toeOffCandidateCount,
        heelStrikeCandidates: this.heelStrikeCandidateCount,
      },
    };
  }
}