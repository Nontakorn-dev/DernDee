/**
 * CSAV 7-phase reference thresholds from Salminen et al., Gait & Posture 2024.
 * Corrective factors target healthy-adult calibration; pathological gait uses widened stride bounds.
 */

export const CSAV_PHASE_TYPES = ['IC', 'HS', 'FF', 'HR', 'TO', 'FA', 'TBV'];

export const CSAV_DEFAULT_OPTIONS = {
  sampleRate: 100,
  minStrideTime: 0.6,
  maxStrideTime: 4.0,
  smoothingWindow: 5,
  hsProminence: 35,
  hsProminenceFloor: 10,
  minHsSeparationScale: 0.8,
  hsVelocityThresholdFloorAbs: 12,
  hsVelocityThresholdCeilingAbs: 50,
  hsEnvelopeScale: 0.35,
  hsPreviousPeakScale: 0.35,
  hsPreviousHsScale: 0.75,
  hsAdaptiveHistorySize: 3,
  hsEnvelopeWindowSeconds: 0.8,
  swingPeakMinAbs: 8,
  swingPeakMinAbsFallback: 3,
  stillAngularVelocityAbs: 10,
  stillDurationSeconds: 0.2,
  minSwingAngularVelocityAbs: 12,
  minOpenStrideTimeSeconds: 0.3,
  toProminence: 20,
  toSearchStartPct: 0.2,
  toSearchEndPct: 0.8,
  icSearchMaxSeconds: 0.35,
  ffCsavStFraction: 0.15,
  hrCsavStFraction: 0.46,
  toCsavStFraction: 0.957,
  faCsavSwFraction: 0.2,
  tbvCsavSwFraction: 0.731,
  hrStrideTimeCorrection: { intercept: 0.156, slope: -0.154 },
  faZpCorrection: { intercept: -0.254, slope: 0.384 },
  usePreviousValidStanceFallback: true,
};
