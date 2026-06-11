import { getRealtimeSensorSideOrder } from '../gateway/realtimeSensorUtils.js';
import { GAIT_RUNTIME_CONFIG } from './gaitRuntimeConfig.js';

export function getSensorDisplayKey(sample) {
  return sample?.side || sample?.sensorKey || null;
}

export function sortSensorsBySide(left, right) {
  const sideDelta = getRealtimeSensorSideOrder(left?.side) - getRealtimeSensorSideOrder(right?.side);
  if (sideDelta !== 0) {
    return sideDelta;
  }

  return (right?.lastSeenAt || 0) - (left?.lastSeenAt || 0);
}

export function resolveVisibleSensorKeys(availableSensors, config = GAIT_RUNTIME_CONFIG) {
  const now = Date.now();
  const staleMs = config.sensorStaleAfterMs ?? GAIT_RUNTIME_CONFIG.sensorStaleAfterMs;
  const maxVisible = config.maxVisibleShankSensors ?? GAIT_RUNTIME_CONFIG.maxVisibleShankSensors;

  const activeSensors = Array.from(availableSensors.values())
    .filter((sensor) => now - sensor.lastSeenAt <= staleMs)
    .sort(sortSensorsBySide);

  const shankSensors = activeSensors.filter((sensor) => sensor.sensorMount === 'shank');
  const preferredSensors = shankSensors.length > 0 ? shankSensors : activeSensors;

  return preferredSensors
    .slice(0, shankSensors.length > 0 ? maxVisible : 1)
    .map((sensor) => sensor.sensorKey);
}

export function averageMetric(values) {
  const numericValues = values.filter(Number.isFinite);
  if (!numericValues.length) {
    return null;
  }

  return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
}

export function buildAggregatedSessionSummary(summaries) {
  if (!summaries.length) {
    return null;
  }

  return {
    totalSteps: summaries.reduce((total, summary) => total + (summary.totalSteps || 0), 0),
    cadenceSpm: averageMetric(summaries.map((summary) => summary.cadenceSpm)) || 0,
    avgStepLengthM: averageMetric(summaries.map((summary) => summary.avgStepLengthM)),
    avgStrideLengthM: averageMetric(summaries.map((summary) => summary.avgStrideLengthM)),
    avgClearanceM: averageMetric(summaries.map((summary) => summary.avgClearanceM)),
    avgSpeedMps: averageMetric(summaries.map((summary) => summary.avgSpeedMps)),
    avgStepDurationS: averageMetric(summaries.map((summary) => summary.avgStepDurationS)),
  };
}

export function toSessionMetricsFromSummary(summary) {
  if (!summary) {
    return {
      total_steps: 0,
      cadence_spm: 0,
      avg_step_length_m: 0,
      avg_stride_length_m: 0,
      avg_clearance_m: 0,
      avg_speed_mps: 0,
    };
  }

  return {
    total_steps: summary.totalSteps || 0,
    cadence_spm: summary.cadenceSpm || 0,
    avg_step_length_m: summary.avgStepLengthM || 0,
    avg_stride_length_m: summary.avgStrideLengthM || 0,
    avg_clearance_m: summary.avgClearanceM || 0,
    avg_speed_mps: summary.avgSpeedMps || 0,
  };
}
