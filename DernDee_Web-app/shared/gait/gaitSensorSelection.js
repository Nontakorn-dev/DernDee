import { getRealtimeSensorSideOrder } from '../gateway/realtimeSensorUtils.js';
import {
  GAIT_MAX_VISIBLE_SHANK_SENSORS,
  GAIT_SENSOR_STALE_AFTER_MS,
} from './gaitRuntimeConfig.js';

export const SHANK_BODY_POSITION_IDS = new Set(['LEFT_SHANK', 'RIGHT_SHANK']);

export function isShankBodyPositionId(positionId) {
  return SHANK_BODY_POSITION_IDS.has(positionId);
}

export function sortGaitSensorStates(left, right) {
  const sideDelta = getRealtimeSensorSideOrder(left?.side) - getRealtimeSensorSideOrder(right?.side);
  if (sideDelta !== 0) {
    return sideDelta;
  }

  return (right?.lastSeenAt || 0) - (left?.lastSeenAt || 0);
}

export function filterActiveShankSensorStates(sensorStates = [], options = {}) {
  const { staleAfterMs = GAIT_SENSOR_STALE_AFTER_MS } = options;
  const now = Date.now();

  return sensorStates
    .filter((sensorState) => now - (sensorState.lastSeenAt || 0) <= staleAfterMs)
    .filter((sensorState) => sensorState.sensorMount === 'shank')
    .sort(sortGaitSensorStates);
}

export function hasActiveShankSensorStates(sensorStates = [], options = {}) {
  return filterActiveShankSensorStates(sensorStates, options).length > 0;
}

export function hasStreamingShankBleDevices(devices = []) {
  return devices.some((device) => (
    isShankBodyPositionId(device.positionId)
    && device.status === 'connected'
    && device.packetCount > 0
  ));
}

export function resolveVisibleShankSensorKeys(sensorStates = [], options = {}) {
  const {
    staleAfterMs = GAIT_SENSOR_STALE_AFTER_MS,
    maxVisibleSensors = GAIT_MAX_VISIBLE_SHANK_SENSORS,
  } = options;

  return filterActiveShankSensorStates(sensorStates, { staleAfterMs })
    .slice(0, maxVisibleSensors)
    .map((sensorState) => sensorState.sensorKey);
}
