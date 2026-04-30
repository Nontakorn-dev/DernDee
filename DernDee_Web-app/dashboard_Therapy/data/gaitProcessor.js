/**
 * Gait Processor - Main Signal Processing Pipeline
 *
 * Coordinates the full pipeline:
 *   Raw IMU -> Kalman Filter -> Gait Event Detection -> Velocity Integration -> Parameters
 *
 * Runs in batch mode on accumulated samples (per analysis window)
 * and emits computed gait parameters.
 */

import { KalmanFilter } from '../dsp/kalmanFilter.js';
import { GaitEventDetector } from '../dsp/gaitEventDetector.js';
import { VelocityIntegrator } from '../dsp/velocityIntegrator.js';
import { rawAccelToG, rawGyroToDps, accelToAngle } from '../dsp/signalUtils.js';

const SAMPLE_RATE = 100;
const WINDOW_SECONDS = 12;
const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SECONDS;
const G_MS2 = 9.81;

export class GaitProcessor {
  constructor() {
    this.kalman = new KalmanFilter(1.0 / SAMPLE_RATE);
    this.eventDetector = new GaitEventDetector({ sampleRate: SAMPLE_RATE });
    this.velocityIntegrator = new VelocityIntegrator({ sampleRate: SAMPLE_RATE });

    this.buffer = [];
    this.maxBuffer = WINDOW_SAMPLES;
    this.paramListeners = [];
    this.latestParams = null;
    this.totalStepCount = 0;
    this.totalStrideCount = 0;
    this.lastCountedCycleStartSampleId = null;
    this.nextSampleId = 1;
    this.sessionStartTime = null;
    this.processedData = {
      timestamps: [],
      angularVelocity: [],
      shankAngle: [],
      events: [],
      cycles: [],
    };
  }

  onParams(callback) {
    this.paramListeners.push(callback);
  }

  addSample(sample) {
    if (!this.sessionStartTime) {
      this.sessionStartTime = Date.now();
    }

    this.buffer.push({
      ...sample,
      sampleId: this.nextSampleId,
    });
    this.nextSampleId += 1;

    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift();
    }
  }

  analyze() {
    if (this.buffer.length < SAMPLE_RATE * 3) {
      return;
    }

    const samples = [...this.buffer];
    const n = samples.length;
    const dt = 1.0 / SAMPLE_RATE;

    const angVelDeg = new Array(n);
    const shankAngle = new Array(n);
    const timestamps = new Array(n);
    const ayG = new Array(n);
    const azG = new Array(n);

    this.kalman.reset();

    for (let i = 0; i < n; i += 1) {
      const s = samples[i];
      timestamps[i] = i * dt;

      const gx = rawGyroToDps(s.gx);
      const aYg = rawAccelToG(s.ay);
      const aZg = rawAccelToG(s.az);

      angVelDeg[i] = gx;
      ayG[i] = aYg;
      azG[i] = aZg;

      const accelAngle = accelToAngle(aYg, aZg);
      shankAngle[i] = this.kalman.update(gx, accelAngle);
    }

    const { events, cycles } = this.eventDetector.detect(angVelDeg, timestamps);
    const strideLengths = [];
    const strideTimes = [];
    const stancePcts = [];
    const swingPcts = [];
    const peakAngles = [];

    for (const cycle of cycles) {
      const startIdx = cycle.hsStart.index;
      const endIdx = cycle.hsEnd.index;

      strideTimes.push(cycle.strideTime);
      stancePcts.push(cycle.stancePct);
      swingPcts.push(cycle.swingPct);

      let peakAngle = -Infinity;
      for (let j = startIdx; j <= endIdx && j < n; j += 1) {
        if (shankAngle[j] > peakAngle) {
          peakAngle = shankAngle[j];
        }
      }
      peakAngles.push(peakAngle);

      const cycleAy = [];
      const cycleAz = [];
      const cycleAngles = [];
      for (let j = startIdx; j <= endIdx && j < n; j += 1) {
        cycleAy.push(ayG[j] * G_MS2);
        cycleAz.push(azG[j] * G_MS2);
        cycleAngles.push(shankAngle[j]);
      }

      const { strideLength } = this.velocityIntegrator.computeStrideLength(
        cycleAy,
        cycleAz,
        cycleAngles,
      );

      const clampedLength = Math.max(0.3, Math.min(2.5, strideLength));
      strideLengths.push(clampedLength);
    }

    if (cycles.length === 0) {
      this.processedData = { timestamps, angularVelocity: angVelDeg, shankAngle, events, cycles };
      this.paramListeners.forEach((cb) => cb({ params: null, processedData: this.processedData }));
      return;
    }

    const lastIdx = cycles.length - 1;
    const lastCycle = cycles[lastIdx];

    const strideLengthLast = strideLengths[lastIdx];
    const strideTimeLast = strideTimes[lastIdx];
    const stancePctLast = stancePcts[lastIdx];
    const swingPctLast = swingPcts[lastIdx];
    const peakAngleLast = peakAngles[lastIdx];

    const cycleStartSampleId = samples[lastCycle.hsStart.index]?.sampleId ?? null;
    if (
      cycleStartSampleId !== null
      && cycleStartSampleId !== this.lastCountedCycleStartSampleId
    ) {
      this.totalStepCount += 1;
      this.lastCountedCycleStartSampleId = cycleStartSampleId;
    }
    this.totalStrideCount = Math.floor(this.totalStepCount / 2);

    const sessionDuration = this.sessionStartTime
      ? (Date.now() - this.sessionStartTime) / 1000
      : 0;

    const cadence = strideTimeLast > 0 ? (2 / strideTimeLast) * 60 : 0;
    const stepLength = strideLengthLast / 2;
    const stepTime = strideTimeLast / 2;
    const walkingSpeed = strideTimeLast > 0 ? strideLengthLast / strideTimeLast : 0;
    const doubleSupportPct = Math.max(0, 2 * stancePctLast - 100);
    const doubleSupport = strideTimeLast * doubleSupportPct / 100;

    this.latestParams = {
      strideLength: strideLengthLast,
      stepLength,
      cadence,
      strideTime: strideTimeLast,
      stepTime,
      stancePct: stancePctLast,
      swingPct: swingPctLast,
      walkingSpeed,
      peakShankAngle: peakAngleLast,
      doubleSupport,
      stepCount: this.totalStepCount,
      strideCount: this.totalStrideCount,
      sessionDuration,
      cycleCount: 1,
      strideLengths: [strideLengthLast],
      strideTimes: [strideTimeLast],
    };

    const lastStart = lastCycle.hsStart.index;
    const lastEnd = lastCycle.hsEnd.index;
    const filteredEvents = events.filter((e) => e.index >= lastStart && e.index <= lastEnd);
    const filteredCycles = [lastCycle];

    this.processedData = {
      timestamps,
      angularVelocity: angVelDeg,
      shankAngle,
      events: filteredEvents,
      cycles: filteredCycles,
    };

    this.paramListeners.forEach((cb) => cb({
      params: this.latestParams,
      processedData: this.processedData,
    }));
  }

  reset() {
    this.buffer = [];
    this.kalman.reset();
    this.latestParams = null;
    this.totalStepCount = 0;
    this.totalStrideCount = 0;
    this.lastCountedCycleStartSampleId = null;
    this.nextSampleId = 1;
    this.sessionStartTime = null;
    this.processedData = {
      timestamps: [],
      angularVelocity: [],
      shankAngle: [],
      events: [],
      cycles: [],
    };
  }
}