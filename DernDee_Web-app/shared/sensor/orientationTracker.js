import { clamp, rad2deg, rawAccelToG, rawGyroToDps } from '../gait/signalUtils.js';

function normalizeQuaternion(quaternion) {
  const magnitude = Math.hypot(quaternion[0], quaternion[1], quaternion[2], quaternion[3]) || 1;
  return quaternion.map((value) => value / magnitude);
}

function quaternionMultiply(a, b) {
  return [
    (a[0] * b[0]) - (a[1] * b[1]) - (a[2] * b[2]) - (a[3] * b[3]),
    (a[0] * b[1]) + (a[1] * b[0]) + (a[2] * b[3]) - (a[3] * b[2]),
    (a[0] * b[2]) - (a[1] * b[3]) + (a[2] * b[0]) + (a[3] * b[1]),
    (a[0] * b[3]) + (a[1] * b[2]) - (a[2] * b[1]) + (a[3] * b[0]),
  ];
}

function quaternionDerivative(quaternion, gxRad, gyRad, gzRad) {
  const [w, x, y, z] = quaternion;
  return [
    0.5 * ((-x * gxRad) - (y * gyRad) - (z * gzRad)),
    0.5 * ((w * gxRad) + (y * gzRad) - (z * gyRad)),
    0.5 * ((w * gyRad) - (x * gzRad) + (z * gxRad)),
    0.5 * ((w * gzRad) + (x * gyRad) - (y * gxRad)),
  ];
}

function initializeFromGravity(ax, ay, az) {
  const norm = Math.hypot(ax, ay, az);
  if (norm < 1e-6) {
    return [1, 0, 0, 0];
  }

  const axNorm = ax / norm;
  const ayNorm = ay / norm;
  const azNorm = az / norm;

  const pitch = Math.atan2(-axNorm, Math.sqrt((ayNorm * ayNorm) + (azNorm * azNorm)));
  const roll = Math.atan2(ayNorm, azNorm);

  const halfRoll = roll * 0.5;
  const halfPitch = pitch * 0.5;

  const cr = Math.cos(halfRoll);
  const sr = Math.sin(halfRoll);
  const cp = Math.cos(halfPitch);
  const sp = Math.sin(halfPitch);

  return normalizeQuaternion([
    cr * cp,
    sr * cp,
    cr * sp,
    -sr * sp,
  ]);
}

function quaternionToEulerDegrees(quaternion) {
  const [w, x, y, z] = quaternion;
  const sinPitch = Math.max(-1, Math.min(1, 2 * ((w * y) - (z * x))));
  const pitchRad = Math.asin(sinPitch);
  const rollRad = Math.atan2(2 * ((w * x) + (y * z)), 1 - (2 * ((x * x) + (y * y))));
  const yawRad = Math.atan2(2 * ((w * z) + (x * y)), 1 - (2 * ((y * y) + (z * z))));

  return {
    yawDeg: rad2deg(yawRad),
    pitchDeg: rad2deg(pitchRad),
    rollDeg: rad2deg(rollRad),
  };
}

export class OrientationTracker {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 100;
    this.defaultDt = 1 / this.sampleRate;
    this.beta = options.beta ?? 0.1;
    this.reset();
  }

  reset() {
    this.q = [1, 0, 0, 0];
    this.lastTimestampMs = null;
    this.lastGyroNormRad = 0;
    this.initialized = false;
  }

  update(sample) {
    const timestampMs = sample.timestampMs ?? null;
    let dt = this.defaultDt;
    if (timestampMs !== null && this.lastTimestampMs !== null) {
      dt = clamp((timestampMs - this.lastTimestampMs) / 1000, 0.005, 0.05);
    }
    this.lastTimestampMs = timestampMs;

    const ax = rawAccelToG(sample.ay);
    const ay = -rawAccelToG(sample.ax);
    const az = rawAccelToG(sample.az);

    const gxRad = rawGyroToDps(sample.gy) * Math.PI / 180;
    const gyRad = -rawGyroToDps(sample.gx) * Math.PI / 180;
    const gzRad = rawGyroToDps(sample.gz) * Math.PI / 180;
    this.lastGyroNormRad = Math.hypot(gxRad, gyRad, gzRad);

    if (!this.initialized) {
      this.q = initializeFromGravity(ax, ay, az);
      this.initialized = true;
    }

    const accelNorm = Math.hypot(ax, ay, az);
    if (accelNorm < 0.01) {
      const euler = quaternionToEulerDegrees(this.q);
      return {
        quaternion: [...this.q],
        yawDeg: euler.yawDeg,
        pitchDeg: euler.pitchDeg,
        rollDeg: euler.rollDeg,
        gyroNormRad: this.lastGyroNormRad,
      };
    }

    const axNorm = ax / accelNorm;
    const ayNorm = ay / accelNorm;
    const azNorm = az / accelNorm;

    let qDot = quaternionDerivative(this.q, gxRad, gyRad, gzRad);

    const [w, x, y, z] = this.q;
    const F = [
      (2 * ((x * z) - (w * y))) - axNorm,
      (2 * ((w * x) + (y * z))) - ayNorm,
      (2 * (0.5 - (x * x) - (y * y))) - azNorm,
    ];

    const J = [
      [-2 * y, 2 * z, -2 * w, 2 * x],
      [2 * x, 2 * w, 2 * z, 2 * y],
      [0, -4 * x, -4 * y, 0],
    ];

    const step = [0, 0, 0, 0];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        step[col] += J[row][col] * F[row];
      }
    }

    const stepNorm = Math.hypot(step[0], step[1], step[2], step[3]);
    if (stepNorm > 0) {
      for (let i = 0; i < 4; i += 1) {
        qDot[i] -= this.beta * (step[i] / stepNorm);
      }
    }

    this.q = normalizeQuaternion(this.q.map((value, index) => value + (qDot[index] * dt)));
    const euler = quaternionToEulerDegrees(this.q);

    return {
      quaternion: [...this.q],
      yawDeg: euler.yawDeg,
      pitchDeg: euler.pitchDeg,
      rollDeg: euler.rollDeg,
      gyroNormRad: this.lastGyroNormRad,
    };
  }
}