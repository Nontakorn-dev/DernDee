import { getRealtimeSensorSideOrder } from '../gateway/realtimeSensorUtils.js';
import {
  GAIT_MAX_VISIBLE_SHANK_SENSORS,
  GAIT_SENSOR_STALE_AFTER_MS,
} from './gaitRuntimeConfig.js';

export function sortGaitSensorStates(left, right) {
  const sideDelta = getRealtimeSensorSideOrder(left?.side) - getRealtimeSensorSideOrder(right?.side);
  if (sideDelta !== 0) {
    return sideDelta;
  }

  return (right?.lastSeenAt || 0) - (left?.lastSeenAt || 0);
}

export function resolveVisibleShankSensorKeys(sensorStates = [], options = {}) {
  const {
    staleAfterMs = GAIT_SENSOR_STALE_AFTER_MS,
    maxVisibleSensors = GAIT_MAX_VISIBLE_SHANK_SENSORS,
  } = options;

  const now = Date.now();
  const activeSensors = sensorStates
    .filter((sensorState) => now - (sensorState.lastSeenAt || 0) <= staleAfterMs)
    .sort(sortGaitSensorStates);

  const shankSensors = activeSensors.filter((sensorState) => sensorState.sensorMount === 'shank');
  const preferredSensors = shankSensors.length > 0 ? shankSensors : activeSensors;

  return preferredSensors
    .slice(0, shankSensors.length > 0 ? maxVisibleSensors : 1)
    .map((sensorState) => sensorState.sensorKey);
}
