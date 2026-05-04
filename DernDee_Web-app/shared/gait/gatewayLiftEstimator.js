import { rawAccelToG, rawGyroToDps } from './signalUtils.js';

const G_MS2 = 9.81;

function normalizeQuaternion(quaternion) {
  const magnitude = Math.hypot(quaternion[0], quaternion[1], quaternion[2], quaternion[3]) || 1;
  return quaternion.map((value) => value / magnitude);
}

function scaleRawSample(rawSample) {
  const [axRaw, ayRaw, azRaw] = rawSample.raw_accel;
  const [gxRaw, gyRaw, gzRaw] = rawSample.raw_gyro;

  return {
    accel: [
      rawAccelToG(axRaw) * G_MS2,
      rawAccelToG(ayRaw) * G_MS2,
      rawAccelToG(azRaw) * G_MS2,
    ],
    gyro: [
      rawGyroToDps(gxRaw) * Math.PI / 180,
      rawGyroToDps(gyRaw) * Math.PI / 180,
      rawGyroToDps(gzRaw) * Math.PI / 180,
    ],
    timestampMs: rawSample.timestamp_ms ?? rawSample.timestamp ?? null,
  };
}

function applyFootAxisConfig(accel, gyro) {
  const [ax, ay, az] = accel;
  const [gx, gy, gz] = gyro;

  return {
    accel: [ay, -ax, az],
    gyro: [gy, -gx, gz],
  };
}

class MadgwickAHRS {
  constructor({ sampleRate = 100, beta = 0.1 } = {}) {
    this.sampleRate = sampleRate;
    this.beta = beta;
    this.q = [1, 0, 0, 0];
  }

  reset() {
    this.q = [1, 0, 0, 0];
  }

  getQuaternion() {
    return [...this.q];
  }

  update(accel, gyro, dt = 1 / this.sampleRate) {
    const [ax, ay, az] = accel;
    const [gx, gy, gz] = gyro;
    const accelNorm = Math.hypot(ax, ay, az);
    if (accelNorm < 0.01) {
      return this.getQuaternion();
    }

    const axNorm = ax / accelNorm;
    const ayNorm = ay / accelNorm;
    const azNorm = az / accelNorm;
    const [w, x, y, z] = this.q;

    const qDot = [
      0.5 * ((-x * gx) - (y * gy) - (z * gz)),
      0.5 * ((w * gx) + (y * gz) - (z * gy)),
      0.5 * ((w * gy) - (x * gz) + (z * gx)),
      0.5 * ((w * gz) + (x * gy) - (y * gx)),
    ];

    const objective = [
      (2 * ((x * z) - (w * y))) - axNorm,
      (2 * ((w * x) + (y * z))) - ayNorm,
      (2 * (0.5 - (x * x) - (y * y))) - azNorm,
    ];

    const jacobian = [
      [-2 * y, 2 * z, -2 * w, 2 * x],
      [2 * x, 2 * w, 2 * z, 2 * y],
      [0, -4 * x, -4 * y, 0],
    ];

    const step = [0, 0, 0, 0];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        step[col] += jacobian[row][col] * objective[row];
      }
    }

    const stepNorm = Math.hypot(step[0], step[1], step[2], step[3]);
    if (stepNorm > 0) {
      for (let index = 0; index < 4; index += 1) {
        qDot[index] -= this.beta * (step[index] / stepNorm);
      }
    }

    this.q = normalizeQuaternion(this.q.map((value, index) => value + (qDot[index] * dt)));
    return this.getQuaternion();
  }
}

export class GatewayLiftEstimator {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 100;
    this.dt = 1 / this.sampleRate;
    this.ahrs = new MadgwickAHRS({ sampleRate: this.sampleRate, beta: 0.1 });
    this.gyroNormHistory = [];
    this.gyroTimeHistory = [];
    this.lastGyroNorm = 0;
    this.lastPacketTimestampMs = null;
    this.setSensorMount(options.sensorMount || 'shank');
    this.resetMotionState();
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
    this.ahrs.reset();
    this.gyroNormHistory = [];
    this.gyroTimeHistory = [];
    this.lastGyroNorm = 0;
    this.lastPacketTimestampMs = null;
    this.resetMotionState();
  }

  resetMotionState() {
    this.isStance = true;
    this.wasStance = true;
    this.stanceStartTimeMs = null;
    this.swingStartTimeMs = null;
    this.swingPeakGyroNorm = 0;
    this.toeOffCandidateCount = 0;
    this.heelStrikeCandidateCount = 0;
    this.position = [0, 0, 0];
    this.velocity = [0, 0, 0];
  }

  rotateToWorld(quaternion, accelLocal) {
    const [w, x, y, z] = quaternion;
    const rotationMatrix = [
      [1 - (2 * ((y * y) + (z * z))), 2 * ((x * y) - (w * z)), 2 * ((x * z) + (w * y))],
      [2 * ((x * y) + (w * z)), 1 - (2 * ((x * x) + (z * z))), 2 * ((y * z) - (w * x))],
      [2 * ((x * z) - (w * y)), 2 * ((y * z) + (w * x)), 1 - (2 * ((x * x) + (y * y)))],
    ];

    return rotationMatrix.map((row) => (
      (row[0] * accelLocal[0]) + (row[1] * accelLocal[1]) + (row[2] * accelLocal[2])
    ));
  }

  getDurationSeconds(startTimeMs, endTimeMs) {
    if (!Number.isFinite(startTimeMs) || !Number.isFinite(endTimeMs)) {
      return null;
    }

    const durationMs = endTimeMs - startTimeMs;
    if (durationMs <= 0) {
      return null;
    }

    return durationMs / 1000;
  }

  detectStance(gyroNorm, currentTimeMs) {
    let tiltRate = 0;
    if (this.gyroNormHistory.length >= 2 && this.gyroTimeHistory.length >= 2) {
      const referenceGyroNorm = this.gyroNormHistory[0];
      const referenceTimeMs = this.gyroTimeHistory[0];
      const dtSeconds = (currentTimeMs - referenceTimeMs) / 1000;
      if (dtSeconds > 0) {
        tiltRate = (gyroNorm - referenceGyroNorm) / dtSeconds;
      }
    }

    this.gyroNormHistory.push(gyroNorm);
    this.gyroTimeHistory.push(currentTimeMs);
    if (this.gyroNormHistory.length > 5) {
      this.gyroNormHistory.shift();
      this.gyroTimeHistory.shift();
    }

    this.lastGyroNorm = gyroNorm;

    if (this.isStance && this.stanceStartTimeMs === null) {
      this.stanceStartTimeMs = currentTimeMs;
    }
    if (!this.isStance && this.swingStartTimeMs === null) {
      this.swingStartTimeMs = currentTimeMs;
    }

    if (this.isStance) {
      const stanceDurationSeconds = this.getDurationSeconds(this.stanceStartTimeMs, currentTimeMs) || 0;
      const toeOffCandidate = (
        stanceDurationSeconds >= this.minStanceDurationS
        && tiltRate > this.tiltRateThreshold
        && gyroNorm >= this.minToeOffGyroNorm
      );

      this.toeOffCandidateCount = toeOffCandidate ? this.toeOffCandidateCount + 1 : 0;
      this.heelStrikeCandidateCount = 0;

      if (this.toeOffCandidateCount >= this.toeOffConfirmSamples) {
        this.isStance = false;
        this.swingStartTimeMs = currentTimeMs;
        this.swingPeakGyroNorm = gyroNorm;
        this.toeOffCandidateCount = 0;
      }
    } else {
      this.swingPeakGyroNorm = Math.max(this.swingPeakGyroNorm, gyroNorm);
      const swingDurationSeconds = this.getDurationSeconds(this.swingStartTimeMs, currentTimeMs) || 0;
      const heelStrikeCandidate = (
        swingDurationSeconds >= this.minSwingDurationS
        && this.swingPeakGyroNorm >= this.minSwingPeakGyroNorm
        && gyroNorm < this.gyroThreshold
      );

      this.heelStrikeCandidateCount = heelStrikeCandidate ? this.heelStrikeCandidateCount + 1 : 0;
      this.toeOffCandidateCount = 0;

      if (this.heelStrikeCandidateCount >= this.heelStrikeConfirmSamples) {
        this.isStance = true;
        this.stanceStartTimeMs = currentTimeMs;
        this.heelStrikeCandidateCount = 0;
      }
    }

    return this.isStance;
  }

  update(accel, gyro, timestampMs, dt = this.dt) {
    const quaternion = this.ahrs.update(accel, gyro, dt);
    const gyroNorm = Math.hypot(gyro[0], gyro[1], gyro[2]);
    const accelWorld = this.rotateToWorld(quaternion, accel);
    const accelLinear = [...accelWorld];
    accelLinear[2] -= G_MS2;

    this.wasStance = this.isStance;
    const isStance = this.detectStance(gyroNorm, timestampMs);

    if (isStance) {
      this.velocity = [0, 0, 0];
      this.position = [0, 0, 0];
    } else {
      const previousVelocity = [...this.velocity];
      this.velocity = this.velocity.map((value, index) => value + (accelLinear[index] * dt));
      this.position = this.position.map((value, index) => (
        value + (((previousVelocity[index] + this.velocity[index]) * 0.5) * dt)
      ));

      const maxSwingZ = this.sensorMount === 'shank' ? 0.20 : 0.35;
      this.position[2] = Math.max(0, Math.min(maxSwingZ, this.position[2]));
      if (this.position[2] <= 0 && this.velocity[2] < 0) {
        this.velocity[2] = 0;
      }
    }

    return this.getCurrentState();
  }

  updateFromRawSample(rawSample) {
    if (!Array.isArray(rawSample?.raw_accel) || !Array.isArray(rawSample?.raw_gyro)) {
      return null;
    }

    if (rawSample.sensor_mount) {
      this.setSensorMount(rawSample.sensor_mount);
    }

    const physics = scaleRawSample(rawSample);
    const mappedAxes = applyFootAxisConfig(physics.accel, physics.gyro);

    let timestampMs = Number.isFinite(physics.timestampMs) ? physics.timestampMs : null;
    let dt = this.dt;

    if (timestampMs === null) {
      timestampMs = this.lastPacketTimestampMs === null
        ? 0
        : this.lastPacketTimestampMs + (this.dt * 1000);
    }

    if (this.lastPacketTimestampMs !== null) {
      const diffMs = timestampMs - this.lastPacketTimestampMs;
      if (diffMs > 0 && diffMs < 500) {
        dt = diffMs / 1000;
      } else {
        timestampMs = this.lastPacketTimestampMs + (this.dt * 1000);
      }
    }

    this.lastPacketTimestampMs = timestampMs;

    return this.update(mappedAxes.accel, mappedAxes.gyro, timestampMs, dt);
  }

  getCurrentState() {
    return {
      is_stance: this.isStance,
      position: [...this.position],
      velocity: [...this.velocity],
      quaternion: this.ahrs.getQuaternion(),
      gyro_norm: this.lastGyroNorm,
    };
  }
}