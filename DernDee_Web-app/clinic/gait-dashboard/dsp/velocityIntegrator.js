/**
 * Velocity Integrator with Drift Correction
 */

import { trapezoidalIntegrate, deg2rad } from './signalUtils.js';

export class VelocityIntegrator {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 100;
    this.dt = 1.0 / this.sampleRate;
    this.gravity = options.gravity || 9.81;
  }

  sensorToWorld(ay, az, angle) {
    const theta = deg2rad(angle);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const aVert = -ay * cosT + az * sinT;
    const aHoriz = -ay * sinT - az * cosT;

    return { aVert, aHoriz };
  }

  computeStrideLength(ayArray, azArray, angles) {
    const n = ayArray.length;
    if (n < 2) {
      return { strideLength: 0, velocity: [], displacement: [] };
    }

    const aHoriz = new Array(n);
    for (let i = 0; i < n; i += 1) {
      const world = this.sensorToWorld(ayArray[i], azArray[i], angles[i]);
      aHoriz[i] = world.aHoriz;
    }

    let velocity = trapezoidalIntegrate(aHoriz, this.dt);
    velocity = this.correctDrift(velocity);
    const displacement = trapezoidalIntegrate(velocity, this.dt);
    const strideLength = Math.abs(displacement[displacement.length - 1]);

    return { strideLength, velocity, displacement };
  }

  correctDrift(velocity) {
    const n = velocity.length;
    if (n < 2) {
      return velocity;
    }

    const vStart = velocity[0];
    const vEnd = velocity[n - 1];
    const driftPerSample = (vEnd - vStart) / (n - 1);

    const corrected = new Array(n);
    for (let i = 0; i < n; i += 1) {
      corrected[i] = velocity[i] - (vStart + driftPerSample * i);
    }

    return corrected;
  }
}