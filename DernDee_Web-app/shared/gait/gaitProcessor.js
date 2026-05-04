import { GaitEventDetector } from './gaitEventDetector.js';
import { KalmanFilter } from './kalmanFilter.js';
import { rawAccelToG, rawGyroToDps, accelToAngle, movingAverage } from './signalUtils.js';
import { VelocityIntegrator } from './velocityIntegrator.js';

const SAMPLE_RATE = 100;
const WINDOW_SECONDS = 12;
const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SECONDS;
const G_MS2 = 9.81;
const EPOCH_THRESHOLD_MS = 946684800000;
const STANCE_ENTRY_ANGULAR_VELOCITY_ABS = 5;
const STEP_LENGTH_MIN_M = 0.15;
const STEP_LENGTH_MAX_M = 1.25;
const STANCE_ENTRY_THRESHOLD_MIN = 3;
const STANCE_ENTRY_THRESHOLD_MAX = 12;
const STANCE_ENTRY_VALLEY_THRESHOLD_MAX = 40;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function median(values) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function resolveAdaptiveStanceThreshold(smoothedAngVel, cycle, peakIdx) {
  const cycleStartIdx = cycle?.hsStart?.index;
  const cycleEndIdx = cycle?.hsEnd?.index;

  if (!Number.isInteger(cycleStartIdx) || !Number.isInteger(cycleEndIdx) || cycleEndIdx <= cycleStartIdx) {
    return STANCE_ENTRY_ANGULAR_VELOCITY_ABS;
  }

  const searchStartIdx = Math.min(cycleEndIdx, Math.max(cycleStartIdx + 1, peakIdx + 1));
  const searchEndIdx = Math.max(searchStartIdx, cycleEndIdx - 1);

  const postPeakAbsValues = [];
  for (let i = searchStartIdx; i <= searchEndIdx; i += 1) {
    if (Number.isFinite(smoothedAngVel[i])) {
      postPeakAbsValues.push(Math.abs(smoothedAngVel[i]));
    }
  }

  if (!postPeakAbsValues.length) {
    return STANCE_ENTRY_ANGULAR_VELOCITY_ABS;
  }

  const sortedAbsValues = [...postPeakAbsValues].sort((left, right) => left - right);
  const quietSampleCount = Math.max(3, Math.min(sortedAbsValues.length, Math.floor(sortedAbsValues.length * 0.2)));
  const quietestAbsValues = sortedAbsValues.slice(0, quietSampleCount);
  const noiseFloor = median(quietestAbsValues);
  const adaptiveThreshold = noiseFloor > 0
    ? clamp(noiseFloor + 2, STANCE_ENTRY_THRESHOLD_MIN, STANCE_ENTRY_THRESHOLD_MAX)
    : STANCE_ENTRY_ANGULAR_VELOCITY_ABS;

  return adaptiveThreshold;
}

function findStepIntegrationWindow(smoothedAngVel, timestamps, cycle) {
  const cycleStartIdx = cycle?.hsStart?.index;
  const cycleEndIdx = cycle?.hsEnd?.index;

  if (!Number.isInteger(cycleStartIdx) || !Number.isInteger(cycleEndIdx) || cycleEndIdx <= cycleStartIdx) {
    const fallbackIdx = cycleEndIdx ?? cycleStartIdx ?? 0;
    return {
      startIdx: cycleStartIdx ?? fallbackIdx,
      endIdx: fallbackIdx,
      startTime: Number.isFinite(timestamps?.[cycleStartIdx]) ? timestamps[cycleStartIdx] : null,
      endTime: Number.isFinite(timestamps?.[fallbackIdx]) ? timestamps[fallbackIdx] : null,
      threshold: STANCE_ENTRY_ANGULAR_VELOCITY_ABS,
      source: 'fallback',
    };
  }

  let peakIdx = cycleStartIdx;
  let peakValue = -Infinity;
  for (let i = cycleStartIdx; i <= cycleEndIdx; i += 1) {
    if (smoothedAngVel[i] > peakValue) {
      peakValue = smoothedAngVel[i];
      peakIdx = i;
    }
  }

  const adaptiveThreshold = resolveAdaptiveStanceThreshold(smoothedAngVel, cycle, peakIdx);
  const valleyThreshold = clamp(
    Math.max(adaptiveThreshold * 1.5, Math.abs(peakValue) * 0.15),
    adaptiveThreshold,
    STANCE_ENTRY_VALLEY_THRESHOLD_MAX,
  );

  const searchStartIdx = Math.min(cycleEndIdx, Math.max(cycleStartIdx + 1, peakIdx + 1));

  for (let i = searchStartIdx + 1; i < cycleEndIdx; i += 1) {
    const prevAbs = Math.abs(smoothedAngVel[i - 1]);
    const currentAbs = Math.abs(smoothedAngVel[i]);
    const nextAbs = Math.abs(smoothedAngVel[i + 1]);

    if (
      currentAbs <= valleyThreshold
      && currentAbs <= prevAbs
      && currentAbs <= nextAbs
    ) {
      return {
        startIdx: cycleStartIdx,
        endIdx: i,
        startTime: Number.isFinite(timestamps?.[cycleStartIdx]) ? timestamps[cycleStartIdx] : null,
        endTime: Number.isFinite(timestamps?.[i]) ? timestamps[i] : null,
        threshold: adaptiveThreshold,
        source: 'post-peak-valley',
      };
    }
  }

  for (let i = searchStartIdx; i < cycleEndIdx; i += 1) {
    const currentValue = smoothedAngVel[i];
    const nextValue = smoothedAngVel[i + 1];
    const currentAbs = Math.abs(currentValue);
    const nextAbs = Math.abs(nextValue);
    const withinThreshold = currentAbs <= adaptiveThreshold;
    const nextSupportsStanceEntry = nextAbs <= adaptiveThreshold || (currentValue >= 0 && nextValue <= 0);

    if (withinThreshold && nextSupportsStanceEntry) {
        return {
          startIdx: cycleStartIdx,
          endIdx: i,
          startTime: Number.isFinite(timestamps?.[cycleStartIdx]) ? timestamps[cycleStartIdx] : null,
          endTime: Number.isFinite(timestamps?.[i]) ? timestamps[i] : null,
          threshold: adaptiveThreshold,
          source: 'adaptive-stance-entry',
        };
    }
  }

  for (let i = searchStartIdx; i < cycleEndIdx; i += 1) {
    if (smoothedAngVel[i] >= 0 && smoothedAngVel[i + 1] <= 0) {
      return {
        startIdx: cycleStartIdx,
        endIdx: i,
        startTime: Number.isFinite(timestamps?.[cycleStartIdx]) ? timestamps[cycleStartIdx] : null,
        endTime: Number.isFinite(timestamps?.[i]) ? timestamps[i] : null,
        threshold: adaptiveThreshold,
        source: 'zero-crossing-fallback',
      };
    }
  }

  let minAbsIdx = searchStartIdx;
  let minAbsValue = Infinity;
  for (let i = searchStartIdx; i <= cycleEndIdx; i += 1) {
    const absValue = Math.abs(smoothedAngVel[i]);
    if (absValue < minAbsValue) {
      minAbsValue = absValue;
      minAbsIdx = i;
    }
  }

  if (Number.isFinite(minAbsValue)) {
    return {
      startIdx: cycleStartIdx,
      endIdx: minAbsIdx,
      startTime: Number.isFinite(timestamps?.[cycleStartIdx]) ? timestamps[cycleStartIdx] : null,
      endTime: Number.isFinite(timestamps?.[minAbsIdx]) ? timestamps[minAbsIdx] : null,
      threshold: adaptiveThreshold,
      source: 'min-abs-fallback',
    };
  }

  return {
    startIdx: cycleStartIdx,
    endIdx: cycleEndIdx,
    startTime: Number.isFinite(timestamps?.[cycleStartIdx]) ? timestamps[cycleStartIdx] : null,
    endTime: Number.isFinite(timestamps?.[cycleEndIdx]) ? timestamps[cycleEndIdx] : null,
    threshold: adaptiveThreshold,
    source: 'hs-end-fallback',
  };
}

function normalizeTimestampField(sample) {
  if (Number.isFinite(sample.timestampMs)) {
    return { valueMs: sample.timestampMs, isAbsolute: sample.timestampMs >= EPOCH_THRESHOLD_MS };
  }

  if (Number.isFinite(sample.timestamp_ms)) {
    return { valueMs: sample.timestamp_ms, isAbsolute: sample.timestamp_ms >= EPOCH_THRESHOLD_MS };
  }

  if (Number.isFinite(sample.timestamp)) {
    const timestampValue = sample.timestamp;
    if (timestampValue >= EPOCH_THRESHOLD_MS) {
      return { valueMs: timestampValue, isAbsolute: true };
    }

    if (Math.abs(timestampValue) < 1e9) {
      return { valueMs: timestampValue * 1000, isAbsolute: false };
    }

    return { valueMs: timestampValue, isAbsolute: false };
  }

  return { valueMs: Date.now(), isAbsolute: true };
}

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
    this.latestSampleTimestampMs = null;
    this.relativeTimestampOriginMs = null;
    this.absoluteTimestampOriginMs = null;
    this.lastSourceTimestampMs = null;
    this.processedData = {
      timestamps: [],
      angularVelocity: [],
      shankAngle: [],
      events: [],
      cycles: [],
      integrationWindow: null,
    };
  }

  onParams(callback) {
    this.paramListeners.push(callback);
  }

  addSample(sample) {
    const timestampMs = this.resolveTimestampMs(sample);
    const dtSeconds = this.getSampleIntervalSeconds(timestampMs);
    const gx = rawGyroToDps(sample.gx);
    const aYg = rawAccelToG(sample.ay);
    const aZg = rawAccelToG(sample.az);
    const accelAngle = accelToAngle(aYg, aZg);
    const shankAngle = this.kalman.update(gx, accelAngle, dtSeconds);

    if (!this.sessionStartTime) {
      this.sessionStartTime = timestampMs;
    }
    this.latestSampleTimestampMs = timestampMs;

    this.buffer.push({
      ...sample,
      sampleId: this.nextSampleId,
      timestampMs,
      shankAngle,
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
    const angVelDeg = new Array(sampleCount);
    const shankAngle = new Array(sampleCount);
    const timestamps = new Array(sampleCount);
    const ayG = new Array(sampleCount);
    const azG = new Array(sampleCount);
    const firstTimestampMs = samples[0]?.timestampMs ?? null;

    for (let i = 0; i < sampleCount; i += 1) {
      const sample = samples[i];
      timestamps[i] = firstTimestampMs !== null
        ? Math.max(0, (sample.timestampMs - firstTimestampMs) / 1000)
        : i * (1.0 / SAMPLE_RATE);

      const gx = rawGyroToDps(sample.gx);
      const aYg = rawAccelToG(sample.ay);
      const aZg = rawAccelToG(sample.az);

      angVelDeg[i] = gx;
      ayG[i] = aYg;
      azG[i] = aZg;
      shankAngle[i] = Number.isFinite(sample.shankAngle) ? sample.shankAngle : 0;
    }

    const { events, cycles } = this.eventDetector.detect(angVelDeg, timestamps);
    const smoothedAngVel = movingAverage(angVelDeg, 5);
    const stepLengths = [];
    const strideTimes = [];
    const stancePcts = [];
    const swingPcts = [];
    const peakAngles = [];
    const clearances = [];
    const integrationWindows = [];

    for (const cycle of cycles) {
      const integrationWindow = findStepIntegrationWindow(smoothedAngVel, timestamps, cycle);
      const metricStartIdx = integrationWindow.startIdx;
      const metricEndIdx = integrationWindow.endIdx;

      strideTimes.push(cycle.strideTime);
      stancePcts.push(cycle.stancePct);
      swingPcts.push(cycle.swingPct);
      integrationWindows.push(integrationWindow);

      let peakAngle = -Infinity;
      for (let j = metricStartIdx; j <= metricEndIdx && j < sampleCount; j += 1) {
        peakAngle = Math.max(peakAngle, shankAngle[j]);
      }
      peakAngles.push(peakAngle);

      const cycleAy = [];
      const cycleAz = [];
      const cycleAngles = [];
      for (let j = metricStartIdx; j <= metricEndIdx && j < sampleCount; j += 1) {
        cycleAy.push(ayG[j] * G_MS2);
        cycleAz.push(azG[j] * G_MS2);
        cycleAngles.push(shankAngle[j]);
      }

      const { strideLength: integratedStepLength, clearance } = this.velocityIntegrator.computeStrideMetrics(
        cycleAy,
        cycleAz,
        cycleAngles,
      );

      stepLengths.push(Math.max(STEP_LENGTH_MIN_M, Math.min(STEP_LENGTH_MAX_M, integratedStepLength)));
      clearances.push(Math.max(0, Math.min(0.3, clearance)));
    }

    if (cycles.length === 0) {
      this.processedData = {
        timestamps,
        angularVelocity: angVelDeg,
        shankAngle,
        events,
        cycles,
        integrationWindow: null,
      };
      this.paramListeners.forEach((callback) => callback({ params: null, processedData: this.processedData }));
      return;
    }

    const lastIdx = cycles.length - 1;
    const lastCycle = cycles[lastIdx];
    const lastIntegrationWindow = integrationWindows[lastIdx] ?? null;
    const stepLengthLast = stepLengths[lastIdx];
    const strideLengthLast = stepLengthLast * 2;
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

    const sessionDuration = this.sessionStartTime && this.latestSampleTimestampMs
      ? (this.latestSampleTimestampMs - this.sessionStartTime) / 1000
      : 0;

    const cadence = strideTimeLast > 0 ? (2 / strideTimeLast) * 60 : 0;
    const stepLength = stepLengthLast;
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
      integrationStartTimestampS: lastIntegrationWindow?.startTime ?? null,
      integrationEndTimestampS: lastIntegrationWindow?.endTime ?? null,
      integrationAngularVelocityThresholdDps: lastIntegrationWindow?.threshold ?? null,
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
      smoothedAngularVelocity: smoothedAngVel,
      events: filteredEvents,
      cycles: filteredCycles,
      integrationWindow: lastIntegrationWindow,
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
    this.latestSampleTimestampMs = null;
    this.relativeTimestampOriginMs = null;
    this.absoluteTimestampOriginMs = null;
    this.lastSourceTimestampMs = null;
    this.processedData = {
      timestamps: [],
      angularVelocity: [],
      shankAngle: [],
      events: [],
      cycles: [],
      integrationWindow: null,
    };
  }

  resolveTimestampMs(sample) {
    const { valueMs, isAbsolute } = normalizeTimestampField(sample);
    if (isAbsolute) {
      this.lastSourceTimestampMs = valueMs;
      return valueMs;
    }

    if (
      this.relativeTimestampOriginMs === null
      || this.absoluteTimestampOriginMs === null
      || (this.lastSourceTimestampMs !== null && valueMs < this.lastSourceTimestampMs - 1000)
    ) {
      this.relativeTimestampOriginMs = valueMs;
      this.absoluteTimestampOriginMs = Date.now();
    }

    this.lastSourceTimestampMs = valueMs;
    return this.absoluteTimestampOriginMs + (valueMs - this.relativeTimestampOriginMs);
  }

  getSampleIntervalSeconds(timestampMs) {
    if (!Number.isFinite(timestampMs) || !Number.isFinite(this.latestSampleTimestampMs)) {
      return 1.0 / SAMPLE_RATE;
    }

    const deltaSeconds = (timestampMs - this.latestSampleTimestampMs) / 1000;
    if (deltaSeconds <= 0 || deltaSeconds > 0.5) {
      return 1.0 / SAMPLE_RATE;
    }

    return deltaSeconds;
  }
}