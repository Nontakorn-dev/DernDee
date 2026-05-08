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
const SUSTAINED_QUIET_SECONDS = 0.12;
const SUSTAINED_QUIET_SAMPLES = Math.max(4, Math.round(SUSTAINED_QUIET_SECONDS * SAMPLE_RATE));
const STANCE_WINDOW_ANGULAR_VELOCITY_ABS = 10;
const STANCE_WINDOW_MIN_DURATION_SECONDS = 0.10;
const STANCE_WINDOW_VARIANCE_SECONDS = 0.08;
const STANCE_WINDOW_VARIANCE_SAMPLES = Math.max(5, Math.round(STANCE_WINDOW_VARIANCE_SECONDS * SAMPLE_RATE));
const STANCE_WINDOW_MATCH_GAP_SAMPLES = Math.max(6, Math.round(0.14 * SAMPLE_RATE));
const STANCE_WINDOW_ACCEL_VARIANCE_MIN = 0.0008;
const STANCE_WINDOW_ACCEL_VARIANCE_MAX = 0.02;
const STANCE_WINDOW_ACCEL_MEAN_DEVIATION_MIN = 0.02;
const STANCE_WINDOW_ACCEL_MEAN_DEVIATION_MAX = 0.12;
const STANCE_WINDOW_ANGULAR_ACCELERATION_ABS = 180;
const STANCE_WINDOW_STRICT_ANGULAR_VELOCITY_ABS = 6;
const STANCE_WINDOW_STRICT_ANGULAR_ACCELERATION_ABS = 120;
const STANCE_WINDOW_STRICT_MIN_DURATION_SECONDS = 0.06;
const MIN_SWING_INTEGRATION_SAMPLES = Math.max(6, Math.round(0.12 * SAMPLE_RATE));
const PATIENT_EVENT_DETECTOR_OPTIONS = {
  sampleRate: SAMPLE_RATE,
  maxStrideTime: 4.0,
  toSearchStartPct: 0.20,
  toSearchEndPct: 0.80,
  hsVelocityThreshold: -50,
  hsVelocityThresholdFloorAbs: 18,
  hsEnvelopeScale: 0.35,
  hsPreviousPeakScale: 0.35,
  hsPreviousHsScale: 0.75,
  hsAdaptiveHistorySize: 3,
  hsEnvelopeWindowSeconds: 0.8,
  usePreviousValidStanceFallback: true,
};

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

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeRollingVariance(values, windowSize) {
  const result = new Array(values.length).fill(0);
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < values.length; i += 1) {
    const startIdx = Math.max(0, i - halfWindow);
    const endIdx = Math.min(values.length - 1, i + halfWindow);
    const windowValues = [];

    for (let j = startIdx; j <= endIdx; j += 1) {
      if (Number.isFinite(values[j])) {
        windowValues.push(values[j]);
      }
    }

    if (windowValues.length < 2) {
      result[i] = 0;
      continue;
    }

    const windowMean = average(windowValues);
    let variance = 0;
    for (const value of windowValues) {
      const delta = value - windowMean;
      variance += delta * delta;
    }

    result[i] = variance / windowValues.length;
  }

  return result;
}

function computeRollingMean(values, windowSize) {
  const result = new Array(values.length).fill(0);
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < values.length; i += 1) {
    const startIdx = Math.max(0, i - halfWindow);
    const endIdx = Math.min(values.length - 1, i + halfWindow);
    const windowValues = [];

    for (let j = startIdx; j <= endIdx; j += 1) {
      if (Number.isFinite(values[j])) {
        windowValues.push(values[j]);
      }
    }

    result[i] = windowValues.length ? average(windowValues) : 0;
  }

  return result;
}

function computeAngularAcceleration(values, sampleRate) {
  const result = new Array(values.length).fill(0);
  if (values.length < 2) {
    return result;
  }

  for (let i = 1; i < values.length - 1; i += 1) {
    result[i] = ((values[i + 1] - values[i - 1]) * sampleRate) / 2;
  }

  result[0] = (values[1] - values[0]) * sampleRate;
  result[values.length - 1] = (values[values.length - 1] - values[values.length - 2]) * sampleRate;

  return result;
}

function resolveStanceAccelVarianceThreshold(accelMagnitudeVariance) {
  const finiteVariances = accelMagnitudeVariance.filter(Number.isFinite);
  if (!finiteVariances.length) {
    return STANCE_WINDOW_ACCEL_VARIANCE_MIN;
  }

  const sortedVariances = [...finiteVariances].sort((left, right) => left - right);
  const quietSampleCount = Math.max(5, Math.min(sortedVariances.length, Math.floor(sortedVariances.length * 0.2)));
  const quietestVariances = sortedVariances.slice(0, quietSampleCount);
  const varianceFloor = median(quietestVariances);

  return clamp(
    (varianceFloor * 4) + STANCE_WINDOW_ACCEL_VARIANCE_MIN,
    STANCE_WINDOW_ACCEL_VARIANCE_MIN,
    STANCE_WINDOW_ACCEL_VARIANCE_MAX,
  );
}

function resolveStanceAccelMeanDeviationThreshold(accelMagnitudeMean) {
  const finiteDeviations = accelMagnitudeMean
    .filter(Number.isFinite)
    .map((value) => Math.abs(value - 1));

  if (!finiteDeviations.length) {
    return STANCE_WINDOW_ACCEL_MEAN_DEVIATION_MIN;
  }

  const sortedDeviations = [...finiteDeviations].sort((left, right) => left - right);
  const quietSampleCount = Math.max(5, Math.min(sortedDeviations.length, Math.floor(sortedDeviations.length * 0.2)));
  const quietestDeviations = sortedDeviations.slice(0, quietSampleCount);
  const deviationFloor = median(quietestDeviations);

  return clamp(
    (deviationFloor * 3) + STANCE_WINDOW_ACCEL_MEAN_DEVIATION_MIN,
    STANCE_WINDOW_ACCEL_MEAN_DEVIATION_MIN,
    STANCE_WINDOW_ACCEL_MEAN_DEVIATION_MAX,
  );
}

function buildStanceWindow(startIdx, endIdx, timestamps) {
  return {
    startIdx,
    endIdx,
    startTime: Number.isFinite(timestamps?.[startIdx]) ? timestamps[startIdx] : null,
    endTime: Number.isFinite(timestamps?.[endIdx]) ? timestamps[endIdx] : null,
  };
}

function extractStrictStanceWindow(startIdx, endIdx, strictMask, timestamps, minSamples) {
  let bestStartIdx = null;
  let bestEndIdx = null;
  let runStartIdx = null;

  for (let i = startIdx; i <= endIdx; i += 1) {
    if (strictMask[i]) {
      if (runStartIdx === null) {
        runStartIdx = i;
      }
      continue;
    }

    if (runStartIdx !== null) {
      const runEndIdx = i - 1;
      if (
        bestStartIdx === null
        || (runEndIdx - runStartIdx) > (bestEndIdx - bestStartIdx)
      ) {
        bestStartIdx = runStartIdx;
        bestEndIdx = runEndIdx;
      }
      runStartIdx = null;
    }
  }

  if (runStartIdx !== null) {
    const runEndIdx = endIdx;
    if (
      bestStartIdx === null
      || (runEndIdx - runStartIdx) > (bestEndIdx - bestStartIdx)
    ) {
      bestStartIdx = runStartIdx;
      bestEndIdx = runEndIdx;
    }
  }

  if (bestStartIdx === null || (bestEndIdx - bestStartIdx + 1) < minSamples) {
    return null;
  }

  return buildStanceWindow(bestStartIdx, bestEndIdx, timestamps);
}

function detectExplicitStanceWindows(smoothedAngVel, accelMagnitudeG, timestamps) {
  const accelMagnitudeVariance = computeRollingVariance(accelMagnitudeG, STANCE_WINDOW_VARIANCE_SAMPLES);
  const accelMagnitudeMean = computeRollingMean(accelMagnitudeG, STANCE_WINDOW_VARIANCE_SAMPLES);
  const angularAcceleration = computeAngularAcceleration(smoothedAngVel, SAMPLE_RATE);
  const accelVarianceThreshold = resolveStanceAccelVarianceThreshold(accelMagnitudeVariance);
  const accelMeanDeviationThreshold = resolveStanceAccelMeanDeviationThreshold(accelMagnitudeMean);
  const minWindowSamples = Math.max(4, Math.round(STANCE_WINDOW_MIN_DURATION_SECONDS * SAMPLE_RATE));
  const strictMinWindowSamples = Math.max(4, Math.round(STANCE_WINDOW_STRICT_MIN_DURATION_SECONDS * SAMPLE_RATE));
  const stanceWindows = [];
  const stanceCandidateMask = new Array(smoothedAngVel.length).fill(false);
  const strictStanceMask = new Array(smoothedAngVel.length).fill(false);

  for (let i = 0; i < smoothedAngVel.length; i += 1) {
    const accelMeanDeviation = Math.abs(accelMagnitudeMean[i] - 1);
    const angularVelocityQuiet = Math.abs(smoothedAngVel[i]) <= STANCE_WINDOW_ANGULAR_VELOCITY_ABS;
    const angularAccelerationQuiet = Math.abs(angularAcceleration[i]) <= STANCE_WINDOW_ANGULAR_ACCELERATION_ABS;
    const accelVarianceQuiet = accelMagnitudeVariance[i] <= accelVarianceThreshold;
    const accelMeanQuiet = accelMeanDeviation <= accelMeanDeviationThreshold;
    stanceCandidateMask[i] = angularVelocityQuiet && angularAccelerationQuiet && accelVarianceQuiet && accelMeanQuiet;

    strictStanceMask[i] = (
      Math.abs(smoothedAngVel[i]) <= STANCE_WINDOW_STRICT_ANGULAR_VELOCITY_ABS
      && Math.abs(angularAcceleration[i]) <= STANCE_WINDOW_STRICT_ANGULAR_ACCELERATION_ABS
      && accelMagnitudeVariance[i] <= (accelVarianceThreshold * 0.75)
      && accelMeanDeviation <= (accelMeanDeviationThreshold * 0.75)
    );
  }

  let windowStartIdx = null;

  for (let i = 0; i < smoothedAngVel.length; i += 1) {
    const isStanceCandidate = stanceCandidateMask[i];

    if (isStanceCandidate) {
      if (windowStartIdx === null) {
        windowStartIdx = i;
      }
      continue;
    }

    if (windowStartIdx !== null) {
      const windowEndIdx = i - 1;
      if ((windowEndIdx - windowStartIdx + 1) >= minWindowSamples) {
        const strictWindow = extractStrictStanceWindow(
          windowStartIdx,
          windowEndIdx,
          strictStanceMask,
          timestamps,
          strictMinWindowSamples,
        );
        if (strictWindow) {
          stanceWindows.push(strictWindow);
        }
      }
      windowStartIdx = null;
    }
  }

  if (windowStartIdx !== null) {
    const windowEndIdx = smoothedAngVel.length - 1;
    if ((windowEndIdx - windowStartIdx + 1) >= minWindowSamples) {
      const strictWindow = extractStrictStanceWindow(
        windowStartIdx,
        windowEndIdx,
        strictStanceMask,
        timestamps,
        strictMinWindowSamples,
      );
      if (strictWindow) {
        stanceWindows.push(strictWindow);
      }
    }
  }

  return {
    stanceWindows,
    accelMagnitudeVariance,
    accelVarianceThreshold,
  };
}

function findStanceWindowAroundIndex(stanceWindows, index, preferredDirection = 'before') {
  const containingWindow = stanceWindows.find((window) => window.startIdx <= index && index <= window.endIdx);
  if (containingWindow) {
    return containingWindow;
  }

  const beforeWindows = stanceWindows.filter((window) => window.endIdx < index && (index - window.endIdx) <= STANCE_WINDOW_MATCH_GAP_SAMPLES);
  const afterWindows = stanceWindows.filter((window) => window.startIdx > index && (window.startIdx - index) <= STANCE_WINDOW_MATCH_GAP_SAMPLES);

  if (preferredDirection === 'after') {
    return afterWindows[0] || beforeWindows[beforeWindows.length - 1] || null;
  }

  return beforeWindows[beforeWindows.length - 1] || afterWindows[0] || null;
}

function buildStanceToStanceIntegration(cycle, stanceWindows, timestamps) {
  if (!cycle?.hsStart || !cycle?.hsEnd || !stanceWindows.length) {
    return null;
  }

  const leftStanceWindow = findStanceWindowAroundIndex(stanceWindows, cycle.hsStart.index, 'before');
  const rightStanceWindow = findStanceWindowAroundIndex(stanceWindows, cycle.hsEnd.index, 'after');

  if (!leftStanceWindow || !rightStanceWindow) {
    return null;
  }

  const integrationStartIdx = leftStanceWindow.endIdx + 1;
  const integrationEndIdx = rightStanceWindow.startIdx - 1;

  if (
    integrationStartIdx >= integrationEndIdx
    || (integrationEndIdx - integrationStartIdx + 1) < MIN_SWING_INTEGRATION_SAMPLES
  ) {
    return null;
  }

  const segmentStartIdx = Math.min(leftStanceWindow.startIdx, integrationStartIdx);
  const segmentEndIdx = Math.max(rightStanceWindow.endIdx, integrationEndIdx);

  return {
    integrationWindow: buildIntegrationWindow(
      integrationStartIdx,
      integrationEndIdx,
      timestamps,
      null,
      'stance-to-stance',
    ),
    segmentStartIdx,
    segmentEndIdx,
    stanceWindowsLocal: [
      {
        startIdx: leftStanceWindow.startIdx - segmentStartIdx,
        endIdx: leftStanceWindow.endIdx - segmentStartIdx,
      },
      {
        startIdx: rightStanceWindow.startIdx - segmentStartIdx,
        endIdx: rightStanceWindow.endIdx - segmentStartIdx,
      },
    ],
  };
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

function buildIntegrationWindow(cycleStartIdx, endIdx, timestamps, threshold, source) {
  return {
    startIdx: cycleStartIdx,
    endIdx,
    startTime: Number.isFinite(timestamps?.[cycleStartIdx]) ? timestamps[cycleStartIdx] : null,
    endTime: Number.isFinite(timestamps?.[endIdx]) ? timestamps[endIdx] : null,
    threshold,
    source,
  };
}

function findStepIntegrationWindow(smoothedAngVel, timestamps, cycle) {
  const cycleStartIdx = cycle?.hsStart?.index;
  const cycleEndIdx = cycle?.hsEnd?.index;

  if (!Number.isInteger(cycleStartIdx) || !Number.isInteger(cycleEndIdx) || cycleEndIdx <= cycleStartIdx) {
    const fallbackIdx = cycleEndIdx ?? cycleStartIdx ?? 0;
    return buildIntegrationWindow(
      cycleStartIdx ?? fallbackIdx,
      fallbackIdx,
      timestamps,
      STANCE_ENTRY_ANGULAR_VELOCITY_ABS,
      'fallback',
    );
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

  let lastValleyIdx = null;
  for (let i = searchStartIdx + 1; i < cycleEndIdx; i += 1) {
    const prevAbs = Math.abs(smoothedAngVel[i - 1]);
    const currentAbs = Math.abs(smoothedAngVel[i]);
    const nextAbs = Math.abs(smoothedAngVel[i + 1]);

    if (
      currentAbs <= valleyThreshold
      && currentAbs <= prevAbs
      && currentAbs <= nextAbs
    ) {
      lastValleyIdx = i;
    }
  }

  if (Number.isInteger(lastValleyIdx)) {
    return buildIntegrationWindow(
      cycleStartIdx,
      lastValleyIdx,
      timestamps,
      adaptiveThreshold,
      'post-peak-valley',
    );
  }

  let quietRunStartIdx = null;
  let lastSustainedQuietStartIdx = null;
  for (let i = searchStartIdx; i <= cycleEndIdx; i += 1) {
    if (Math.abs(smoothedAngVel[i]) <= adaptiveThreshold) {
      if (quietRunStartIdx === null) {
        quietRunStartIdx = i;
      }

      if ((i - quietRunStartIdx + 1) >= SUSTAINED_QUIET_SAMPLES) {
        lastSustainedQuietStartIdx = quietRunStartIdx;
      }
    } else {
      quietRunStartIdx = null;
    }
  }

  if (Number.isInteger(lastSustainedQuietStartIdx)) {
    return buildIntegrationWindow(
      cycleStartIdx,
      lastSustainedQuietStartIdx,
      timestamps,
      adaptiveThreshold,
      'sustained-quiet-start',
    );
  }

  let lastThresholdIdx = null;
  for (let i = searchStartIdx; i < cycleEndIdx; i += 1) {
    const currentValue = smoothedAngVel[i];
    const nextValue = smoothedAngVel[i + 1];
    const currentAbs = Math.abs(currentValue);
    const nextAbs = Math.abs(nextValue);
    const withinThreshold = currentAbs <= adaptiveThreshold;
    const nextSupportsStanceEntry = nextAbs <= adaptiveThreshold || (currentValue >= 0 && nextValue <= 0);

    if (withinThreshold && nextSupportsStanceEntry) {
      lastThresholdIdx = i;
    }
  }

  if (Number.isInteger(lastThresholdIdx)) {
    return buildIntegrationWindow(
      cycleStartIdx,
      lastThresholdIdx,
      timestamps,
      adaptiveThreshold,
      'adaptive-stance-entry',
    );
  }

  let lastZeroCrossingIdx = null;
  for (let i = searchStartIdx; i < cycleEndIdx; i += 1) {
    if (smoothedAngVel[i] >= 0 && smoothedAngVel[i + 1] <= 0) {
      lastZeroCrossingIdx = i;
    }
  }

  if (Number.isInteger(lastZeroCrossingIdx)) {
    return buildIntegrationWindow(
      cycleStartIdx,
      lastZeroCrossingIdx,
      timestamps,
      adaptiveThreshold,
      'zero-crossing-fallback',
    );
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
    return buildIntegrationWindow(
      cycleStartIdx,
      minAbsIdx,
      timestamps,
      adaptiveThreshold,
      'min-abs-fallback',
    );
  }

  return buildIntegrationWindow(
    cycleStartIdx,
    cycleEndIdx,
    timestamps,
    adaptiveThreshold,
    'hs-end-fallback',
  );
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
    this.eventDetector = new GaitEventDetector(PATIENT_EVENT_DETECTOR_OPTIONS);
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
    const accelMagnitudeG = new Array(sampleCount);
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

      const aXg = rawAccelToG(sample.ax);
      const gx = rawGyroToDps(sample.gx);
      const aYg = rawAccelToG(sample.ay);
      const aZg = rawAccelToG(sample.az);

      angVelDeg[i] = gx;
      accelMagnitudeG[i] = Math.hypot(aXg, aYg, aZg);
      ayG[i] = aYg;
      azG[i] = aZg;
      shankAngle[i] = Number.isFinite(sample.shankAngle) ? sample.shankAngle : 0;
    }

    const { events, cycles } = this.eventDetector.detect(angVelDeg, timestamps);
    const smoothedAngVel = movingAverage(angVelDeg, 5);
    const { stanceWindows } = detectExplicitStanceWindows(smoothedAngVel, accelMagnitudeG, timestamps);
    const stepLengths = [];
    const strideLengths = [];
    const strideTimes = [];
    const stancePcts = [];
    const swingPcts = [];
    const peakAngles = [];
    const clearances = [];
    const integrationWindows = [];

    for (const cycle of cycles) {
      const stanceToStanceIntegration = buildStanceToStanceIntegration(cycle, stanceWindows, timestamps);
      const integrationWindow = stanceToStanceIntegration?.integrationWindow
        || findStepIntegrationWindow(smoothedAngVel, timestamps, cycle);
      const metricStartIdx = integrationWindow.startIdx;
      const metricEndIdx = integrationWindow.endIdx;
      const segmentStartIdx = stanceToStanceIntegration?.segmentStartIdx ?? metricStartIdx;
      const segmentEndIdx = stanceToStanceIntegration?.segmentEndIdx ?? metricEndIdx;
      const localIntegrationStartIdx = metricStartIdx - segmentStartIdx;
      const localIntegrationEndIdx = metricEndIdx - segmentStartIdx;

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
      for (let j = segmentStartIdx; j <= segmentEndIdx && j < sampleCount; j += 1) {
        cycleAy.push(ayG[j] * G_MS2);
        cycleAz.push(azG[j] * G_MS2);
        cycleAngles.push(shankAngle[j]);
      }

      const { strideLength: integratedStrideLength, clearance } = this.velocityIntegrator.computeStrideMetrics(
        cycleAy,
        cycleAz,
        cycleAngles,
        {
          integrationStartIdx: localIntegrationStartIdx,
          integrationEndIdx: localIntegrationEndIdx,
          stanceWindows: stanceToStanceIntegration?.stanceWindowsLocal || [],
        },
      );

      const strideLength = Math.max(STEP_LENGTH_MIN_M, Math.min(STEP_LENGTH_MAX_M, integratedStrideLength));
      strideLengths.push(strideLength);
      stepLengths.push(strideLength / 2);
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

    const sessionDuration = this.sessionStartTime && this.latestSampleTimestampMs
      ? (this.latestSampleTimestampMs - this.sessionStartTime) / 1000
      : 0;

    const cadence = strideTimeLast > 0 ? (2 / strideTimeLast) * 60 : 0;
    const stepLength = stepLengthLast;
    const stepTime = strideTimeLast / 2;
    const walkingSpeed = strideTimeLast > 0 ? strideLengthLast / strideTimeLast : 0;
    const doubleSupportPct = Number.isFinite(stancePctLast)
      ? Math.max(0, 2 * stancePctLast - 100)
      : null;
    const doubleSupport = Number.isFinite(doubleSupportPct)
      ? strideTimeLast * doubleSupportPct / 100
      : null;

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
      temporalSource: lastCycle.temporalSource ?? null,
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