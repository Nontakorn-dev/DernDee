import { GaitEventDetector } from './gaitEventDetector.js';
import { KalmanFilter } from './kalmanFilter.js';
import { rawAccelToG, rawGyroToDps, accelToAngle } from './signalUtils.js';
import { VelocityIntegrator } from './velocityIntegrator.js';

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
      timestampMs: sample.timestampMs ?? Date.now(),
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
    const sampleCount = samples.length;
    const dt = 1.0 / SAMPLE_RATE;

    const angVelDeg = new Array(sampleCount);
    const shankAngle = new Array(sampleCount);
    const timestamps = new Array(sampleCount);
    const ayG = new Array(sampleCount);
    const azG = new Array(sampleCount);

    this.kalman.reset();

    for (let i = 0; i < sampleCount; i += 1) {
      const sample = samples[i];
      timestamps[i] = i * dt;

      const gx = rawGyroToDps(sample.gx);
      const aYg = rawAccelToG(sample.ay);
      const aZg = rawAccelToG(sample.az);

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
    const clearances = [];

    for (const cycle of cycles) {
      const startIdx = cycle.hsStart.index;
      const endIdx = cycle.hsEnd.index;

      strideTimes.push(cycle.strideTime);
      stancePcts.push(cycle.stancePct);
      swingPcts.push(cycle.swingPct);

      let peakAngle = -Infinity;
      for (let j = startIdx; j <= endIdx && j < sampleCount; j += 1) {
        peakAngle = Math.max(peakAngle, shankAngle[j]);
      }
      peakAngles.push(peakAngle);

      const cycleAy = [];
      const cycleAz = [];
      const cycleAngles = [];
      for (let j = startIdx; j <= endIdx && j < sampleCount; j += 1) {
        cycleAy.push(ayG[j] * G_MS2);
        cycleAz.push(azG[j] * G_MS2);
        cycleAngles.push(shankAngle[j]);
      }

      const { strideLength, clearance } = this.velocityIntegrator.computeStrideMetrics(
        cycleAy,
        cycleAz,
        cycleAngles,
      );

      strideLengths.push(Math.max(0.3, Math.min(2.5, strideLength)));
      clearances.push(Math.max(0, Math.min(0.3, clearance)));
    }

    if (cycles.length === 0) {
      this.processedData = { timestamps, angularVelocity: angVelDeg, shankAngle, events, cycles };
      this.paramListeners.forEach((callback) => callback({ params: null, processedData: this.processedData }));
      return;
    }

    const lastIdx = cycles.length - 1;
    const lastCycle = cycles[lastIdx];
    const strideLengthLast = strideLengths[lastIdx];
    const strideTimeLast = strideTimes[lastIdx];
    const stancePctLast = stancePcts[lastIdx];
    const swingPctLast = swingPcts[lastIdx];
    const peakAngleLast = peakAngles[lastIdx];
    const clearanceLast = clearances[lastIdx];
    const cycleStartSample = samples[lastCycle.hsStart.index] ?? null;
    const cycleEndSample = samples[lastCycle.hsEnd.index] ?? null;
    const cycleStartSampleId = cycleStartSample?.sampleId ?? null;
    const cycleStartTimestampMs = cycleStartSample?.timestampMs ?? null;

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
      clearance: clearanceLast,
      cadence,
      strideTime: strideTimeLast,
      stepTime,
      stanceTime: lastCycle.stanceTime,
      swingTime: lastCycle.swingTime,
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
      cycleStartSampleId,
      cycleStartTimestampMs,
      cycleEndTimestampMs: cycleEndSample?.timestampMs ?? null,
      cycleKey: cycleStartSampleId !== null ? String(cycleStartSampleId) : `${cycleStartTimestampMs ?? Date.now()}`,
      side: cycleStartSample?.side ?? null,
      sensorName: cycleStartSample?.sensorName ?? null,
      sensorMount: cycleStartSample?.sensorMount ?? null,
    };

    const lastStart = lastCycle.hsStart.index;
    const lastEnd = lastCycle.hsEnd.index;
    const filteredEvents = events.filter((event) => event.index >= lastStart && event.index <= lastEnd);
    const filteredCycles = [lastCycle];

    this.processedData = {
      timestamps,
      angularVelocity: angVelDeg,
      shankAngle,
      events: filteredEvents,
      cycles: filteredCycles,
    };

    this.paramListeners.forEach((callback) => callback({
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