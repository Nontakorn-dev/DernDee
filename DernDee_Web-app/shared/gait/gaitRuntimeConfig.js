/**
 * Shared gait runtime configuration aligned with docs/sota-stroke-gait-analysis-prd.md
 * Phase 3: CSAV TO→IC spatial integration + session quality scoring.
 */

export const GAIT_ALGORITHM_VERSION = '3.0.0-csav-spatial';

export const GAIT_SENSOR_MODE = 'shank-csav-spatial';

export const GAIT_RUNTIME_CONFIG = {
  analysisIntervalMs: 400,
  minAnalysisSamples: 300,
  maxVisibleShankSensors: 2,
  sensorStaleAfterMs: 2500,
  sensorMode: GAIT_SENSOR_MODE,
};

/** Auxiliary stance-stability thresholds (PRD §8.4 — gyro validation, not step detection). */
export const STANCE_STABILITY_CONFIG = {
  gyroNormThreshold: 0.24,
  tiltRateThreshold: 1.4,
  historySize: 5,
};
