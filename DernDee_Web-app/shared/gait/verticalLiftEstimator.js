import { clamp, deg2rad, rawAccelToG } from './signalUtils.js';
import { RealtimeStepDetector } from './realtimeStepDetector.js';

const DEFAULT_SAMPLE_RATE = 100;
const G_MS2 = 9.81;
const MAX_LINEAR_ACCEL_MPS2 = 18;
const MAX_VELOCITY_MPS = 2.5;
const MAX_HEIGHT_M = 0.35;
const MIN_STABLE_SWING_SAMPLES = 5;
const MIN_RELIABLE_HEIGHT_M = 0.012;
const STANCE_BIAS_ALPHA = 0.08;
const ACCEL_FILTER_ALPHA = 0.3;
const HEIGHT_SMOOTH_ALPHA = 0.35;
const STANCE_ZERO_EPSILON_M = 0.003;

function projectVerticalLinearAccelerationMps2(ayRaw, azRaw, pitchDeg, gravity) {
  const ayMps2 = rawAccelToG(ayRaw) * gravity;
  const azMps2 = rawAccelToG(azRaw) * gravity;
  const pitchRad = deg2rad(pitchDeg);
  const sensorVerticalMps2 = (-ayMps2 * Math.cos(pitchRad)) + (azMps2 * Math.sin(pitchRad));
  return sensorVerticalMps2 - gravity;
}

export class VerticalLiftEstimator {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
    this.defaultDt = 1 / this.sampleRate;
    this.gravity = options.gravity || G_MS2;
    this.maxHeightM = options.maxHeightM || MAX_HEIGHT_M;
    this.maxVelocityMps = options.maxVelocityMps || MAX_VELOCITY_MPS;
    this.stepDetector = new RealtimeStepDetector({
      sensorMount: options.sensorMount || 'shank',
    });
    this.reset();
  }

  reset() {
    this.stepDetector.reset();
    this.lastTimestampMs = null;
    this.phase = 'STANCE';
    this.verticalVelocityMps = 0;
    this.verticalDisplacementM = 0;
    this.smoothedHeightM = 0;
    this.filteredLinearAccelMps2 = 0;
    this.verticalAccelBiasMps2 = 0;
    this.stanceSampleCount = 0;
    this.swingSampleCount = 0;
    this.isStable = false;
  }

  setSensorMount(sensorMount = 'unknown') {
    this.stepDetector.setSensorMount(sensorMount);
  }

  forceStance() {
    this.stepDetector.reset();
    this.phase = 'STANCE';
    this.verticalVelocityMps = 0;
    this.verticalDisplacementM = 0;
    this.smoothedHeightM = 0;
    this.filteredLinearAccelMps2 = 0;
    this.stanceSampleCount = 0;
    this.swingSampleCount = 0;
    this.isStable = false;
  }

  update(sample) {
    const timestampMs = sample.timestampMs ?? null;
    let dt = this.defaultDt;
    if (timestampMs !== null && this.lastTimestampMs !== null) {
      dt = clamp((timestampMs - this.lastTimestampMs) / 1000, 0.005, 0.05);
    }
    this.lastTimestampMs = timestampMs;

    if (sample.sensorMount) {
      this.setSensorMount(sample.sensorMount);
    }

    const stepState = this.stepDetector.update(sample);
    const nextPhase = stepState.phase;
    const enteredStance = nextPhase === 'STANCE' && this.phase !== 'STANCE';
    const enteredSwing = nextPhase === 'SWING' && this.phase !== 'SWING';

    const rawLinearAccelMps2 = projectVerticalLinearAccelerationMps2(
      sample.ay,
      sample.az,
      sample.pitchDeg ?? 0,
      this.gravity,
    );

    if (nextPhase === 'STANCE') {
      this.verticalAccelBiasMps2 += (rawLinearAccelMps2 - this.verticalAccelBiasMps2) * STANCE_BIAS_ALPHA;
    }

    const biasCorrectedLinearAccelMps2 = clamp(
      rawLinearAccelMps2 - this.verticalAccelBiasMps2,
      -MAX_LINEAR_ACCEL_MPS2,
      MAX_LINEAR_ACCEL_MPS2,
    );

    this.filteredLinearAccelMps2 += (
      biasCorrectedLinearAccelMps2 - this.filteredLinearAccelMps2
    ) * ACCEL_FILTER_ALPHA;

    if (nextPhase === 'STANCE') {
      this.stanceSampleCount += 1;
      this.swingSampleCount = 0;
      this.verticalVelocityMps = 0;

      if (enteredStance) {
        this.verticalDisplacementM *= 0.35;
      }

      this.verticalDisplacementM *= this.stanceSampleCount >= 2 ? 0.45 : 0.65;
      if (this.verticalDisplacementM < STANCE_ZERO_EPSILON_M) {
        this.verticalDisplacementM = 0;
      }
      this.isStable = false;
    } else {
      this.stanceSampleCount = 0;
      if (enteredSwing) {
        this.swingSampleCount = 0;
      }

      this.swingSampleCount += 1;
      this.verticalVelocityMps = clamp(
        this.verticalVelocityMps + (this.filteredLinearAccelMps2 * dt),
        -this.maxVelocityMps,
        this.maxVelocityMps,
      );

      const nextDisplacementM = this.verticalDisplacementM + (this.verticalVelocityMps * dt);
      this.verticalDisplacementM = clamp(nextDisplacementM, 0, this.maxHeightM);

      if (this.verticalDisplacementM === 0 && this.verticalVelocityMps < 0) {
        this.verticalVelocityMps = 0;
      }

      this.isStable = (
        this.swingSampleCount >= MIN_STABLE_SWING_SAMPLES
        || this.verticalDisplacementM >= MIN_RELIABLE_HEIGHT_M
      );
    }

    if (nextPhase === 'STANCE' && this.verticalDisplacementM === 0) {
      this.smoothedHeightM = 0;
    } else {
      this.smoothedHeightM += (this.verticalDisplacementM - this.smoothedHeightM) * HEIGHT_SMOOTH_ALPHA;
    }

    this.phase = nextPhase;

    return {
      event: stepState.event,
      phase: nextPhase,
      isStance: nextPhase === 'STANCE',
      isStable: this.isStable,
      heightCm: this.smoothedHeightM * 100,
      rawHeightCm: this.verticalDisplacementM * 100,
      linearVerticalAccelMps2: this.filteredLinearAccelMps2,
      swingSamples: this.swingSampleCount,
      debug: stepState.debug,
    };
  }
}