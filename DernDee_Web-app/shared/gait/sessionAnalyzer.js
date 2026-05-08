function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export class GaitSessionAnalyzer {
  constructor() {
    this.reset();
  }

  record(params) {
    if (!params?.cycleKey || params.cycleKey === this.lastCycleKey) {
      return null;
    }

    this.lastCycleKey = params.cycleKey;
    this.lastParams = params;

    const row = {
      recorded_at: params.cycleStartTimestampMs ? new Date(params.cycleStartTimestampMs).toISOString() : new Date().toISOString(),
      side: params.side === 'L' ? 'left' : params.side === 'R' ? 'right' : null,
      step_index: this.rows.length + 1,
      step_length_m: params.stepLength ?? null,
      stride_length_m: params.strideLength ?? null,
      step_time_s: params.stepTime ?? null,
      swing_time_s: params.swingTime ?? null,
      stance_time_s: params.stanceTime ?? null,
      stride_time_s: params.strideTime ?? null,
      max_clearance_m: params.clearance ?? null,
      speed_mps: params.walkingSpeed ?? null,
      symmetry_percent: null,
      push_off_velocity_mps: null,
      touchdown_pitch_deg: null,
      raw_payload: {
        cadence_spm: params.cadence ?? null,
        peak_shank_angle_deg: params.peakShankAngle ?? null,
        temporal_source: params.temporalSource ?? null,
        sensor_name: params.sensorName ?? null,
        sensor_mount: params.sensorMount ?? null,
      },
    };

    this.rows.push(row);

    if (Number.isFinite(params.strideLength)) {
      this.strideLengths.push(params.strideLength);
    }
    if (Number.isFinite(params.stepLength)) {
      this.stepLengths.push(params.stepLength);
    }
    if (Number.isFinite(params.walkingSpeed)) {
      this.speeds.push(params.walkingSpeed);
    }
    if (Number.isFinite(params.stepTime)) {
      this.stepTimes.push(params.stepTime);
    }
    if (Number.isFinite(params.clearance)) {
      this.clearances.push(params.clearance);
    }
    if (Number.isFinite(params.cadence)) {
      this.cadences.push(params.cadence);
    }

    return row;
  }

  getSummary() {
    const lastParams = this.lastParams;
    return {
      totalSteps: lastParams?.stepCount ?? this.rows.length,
      cadenceSpm: lastParams?.cadence ?? average(this.cadences),
      avgStepLengthM: average(this.stepLengths),
      avgStrideLengthM: average(this.strideLengths),
      avgClearanceM: average(this.clearances),
      avgSpeedMps: average(this.speeds),
      avgStepDurationS: average(this.stepTimes),
    };
  }

  getGaitMetricsRows() {
    return this.rows.map((row) => ({ ...row, raw_payload: { ...(row.raw_payload || {}) } }));
  }

  reset() {
    this.lastCycleKey = null;
    this.lastParams = null;
    this.rows = [];
    this.strideLengths = [];
    this.stepLengths = [];
    this.speeds = [];
    this.stepTimes = [];
    this.clearances = [];
    this.cadences = [];
  }
}