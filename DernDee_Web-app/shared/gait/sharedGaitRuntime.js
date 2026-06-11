import { getRealtimeSensorLabel } from '../gateway/realtimeSensorUtils.js';
import { createGaitProcessorClient } from './gaitProcessorClient.js';
import { GAIT_ALGORITHM_VERSION, GAIT_RUNTIME_CONFIG } from './gaitRuntimeConfig.js';
import {
  buildAggregatedSessionSummary,
  getSensorDisplayKey,
  resolveVisibleSensorKeys,
  sortSensorsBySide,
} from './gaitRuntimeUtils.js';
import { GaitSessionAnalyzer } from './sessionAnalyzer.js';
import { StanceStabilityMonitor } from './stanceStabilityMonitor.js';

/**
 * Unified gait analysis runtime for free_walk, stepping_stones, and gait-dashboard.
 * All consumers share GaitProcessor + GaitEventDetector with identical timing and sensor rules.
 */
export class SharedGaitRuntime {
  constructor(options = {}) {
    this.config = { ...GAIT_RUNTIME_CONFIG, ...options.config };
    this.enableSessionAnalyzer = options.enableSessionAnalyzer ?? false;
    this.enableStanceStability = options.enableStanceStability ?? false;

    this.availableSensors = new Map();
    this.sensorStates = new Map();
    this.visibleSensorKeys = [];
    this.analysisTimer = null;
    this.paramsListeners = new Set();
    this.summaryListeners = new Set();
    this.visibilityListeners = new Set();
  }

  get algorithmVersion() {
    return GAIT_ALGORITHM_VERSION;
  }

  get sensorMode() {
    return this.config.sensorMode;
  }

  onParams(listener) {
    this.paramsListeners.add(listener);
    return () => this.paramsListeners.delete(listener);
  }

  onSummary(listener) {
    this.summaryListeners.add(listener);
    return () => this.summaryListeners.delete(listener);
  }

  onVisibilityChange(listener) {
    this.visibilityListeners.add(listener);
    return () => this.visibilityListeners.delete(listener);
  }

  startAnalysisLoop() {
    this.stopAnalysisLoop();
    this.analysisTimer = setInterval(() => {
      this.analyzeReadyProcessors();
    }, this.config.analysisIntervalMs);
  }

  stopAnalysisLoop() {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
  }

  analyzeReadyProcessors() {
    this.sensorStates.forEach((state) => {
      if (state.sampleCount >= this.config.minAnalysisSamples) {
        state.processor.analyze();
      }
    });
  }

  ingestSample(sample) {
    if (!sample?.sensorKey) {
      return null;
    }

    const now = Date.now();
    this.availableSensors.set(sample.sensorKey, {
      sensorKey: sample.sensorKey,
      side: sample.side || null,
      sensorMount: sample.sensorMount || null,
      label: getRealtimeSensorLabel(sample),
      lastSeenAt: now,
    });

    const nextVisibleSensorKeys = resolveVisibleSensorKeys(this.availableSensors, this.config);
    const visibilityChanged = nextVisibleSensorKeys.join('|') !== this.visibleSensorKeys.join('|');
    this.visibleSensorKeys = nextVisibleSensorKeys;

    if (visibilityChanged) {
      this._syncProcessors();
      this._emitVisibilityChange();
    }

    if (!this.visibleSensorKeys.includes(sample.sensorKey)) {
      return null;
    }

    const displayKey = getSensorDisplayKey(sample);
    const state = this._ensureSensorState(displayKey, sample);
    state.label = getRealtimeSensorLabel(sample);
    state.side = sample.side || null;
    state.sensorKey = sample.sensorKey;
    state.sensorMount = sample.sensorMount || null;
    state.lastSeenAt = now;

    state.processor.addSample({
      ax: sample.ax,
      ay: sample.ay,
      az: sample.az,
      gx: sample.gx,
      gy: sample.gy,
      gz: sample.gz,
      timestampMs: sample.timestampMs ?? sample.timestamp_ms,
      side: sample.side,
      sensorName: sample.name,
      sensorMount: sample.sensorMount,
    });
    state.sampleCount += 1;

    if (state.stanceStability) {
      state.lastStability = state.stanceStability.update(sample);
    }

    return state;
  }

  getVisibleSensorKeys() {
    return [...this.visibleSensorKeys];
  }

  getVisibleSensorStates() {
    return this.visibleSensorKeys
      .map((sensorKey) => {
        const meta = this.availableSensors.get(sensorKey);
        if (!meta) {
          return null;
        }
        const displayKey = meta.side || sensorKey;
        return this.sensorStates.get(displayKey) || null;
      })
      .filter(Boolean)
      .sort(sortSensorsBySide);
  }

  getChartEntries() {
    return Array.from(this.sensorStates.values())
      .filter((state) => state.latestProcessedData)
      .sort(sortSensorsBySide)
      .map((state) => ({
        key: state.displayKey,
        label: state.label,
        side: state.side,
        sensorKey: state.sensorKey,
        params: state.latestParams,
        processedData: state.latestProcessedData,
      }));
  }

  getAllEvents() {
    return this.getChartEntries()
      .flatMap((entry) => (entry.processedData?.events || []).map((event) => ({
        ...event,
        side: entry.side,
      })))
      .sort((left, right) => (left.time || 0) - (right.time || 0));
  }

  getSensorSummary() {
    return this.visibleSensorKeys
      .map((sensorKey) => this.availableSensors.get(sensorKey))
      .filter(Boolean)
      .sort(sortSensorsBySide)
      .map((sensor) => ({
        label: sensor.label,
        side: sensor.side,
        sensorMount: sensor.sensorMount,
      }));
  }

  getAggregatedSessionSummary() {
    const summaries = this.getVisibleSensorStates()
      .map((state) => state.latestSummary)
      .filter(Boolean);

    return buildAggregatedSessionSummary(summaries);
  }

  getStability(sensorKey) {
    const meta = this.availableSensors.get(sensorKey);
    if (!meta) {
      return null;
    }

    const displayKey = meta.side || sensorKey;
    return this.sensorStates.get(displayKey)?.lastStability ?? null;
  }

  getSensorStateByKey(sensorKey) {
    const meta = this.availableSensors.get(sensorKey);
    if (!meta) {
      return null;
    }

    const displayKey = meta.side || sensorKey;
    return this.sensorStates.get(displayKey) || null;
  }

  collectGaitMetricsRows() {
    return Array.from(this.sensorStates.values())
      .flatMap((state) => state.sessionAnalyzer?.getGaitMetricsRows?.() || []);
  }

  reset() {
    this.stopAnalysisLoop();
    this._destroyAllProcessors();
    this.availableSensors.clear();
    this.sensorStates.clear();
    this.visibleSensorKeys = [];
    this._emitVisibilityChange();
    this._emitSummary();
  }

  destroy() {
    this.reset();
    this.paramsListeners.clear();
    this.summaryListeners.clear();
    this.visibilityListeners.clear();
  }

  _ensureSensorState(displayKey, sample) {
    if (this.sensorStates.has(displayKey)) {
      return this.sensorStates.get(displayKey);
    }

    const processor = createGaitProcessorClient();
    const state = {
      displayKey,
      sensorKey: sample.sensorKey,
      label: getRealtimeSensorLabel(sample),
      side: sample.side || null,
      sensorMount: sample.sensorMount || null,
      lastSeenAt: Date.now(),
      sampleCount: 0,
      processor,
      sessionAnalyzer: this.enableSessionAnalyzer ? new GaitSessionAnalyzer() : null,
      stanceStability: this.enableStanceStability ? new StanceStabilityMonitor() : null,
      latestParams: null,
      latestProcessedData: null,
      latestSummary: null,
      lastStability: null,
      unsubscribeParams: null,
    };

    state.unsubscribeParams = processor.onParams(({ params, processedData }) => {
      state.latestParams = params;
      state.latestProcessedData = processedData;

      if (params && state.sessionAnalyzer) {
        state.sessionAnalyzer.record(params);
        state.latestSummary = state.sessionAnalyzer.getSummary();
        this._emitSummary();
      }

      this.paramsListeners.forEach((listener) => {
        listener({
          displayKey,
          sensorKey: state.sensorKey,
          params,
          processedData,
          state,
        });
      });
    });

    this.sensorStates.set(displayKey, state);
    return state;
  }

  _syncProcessors() {
    const nextDisplayKeys = new Set(
      this.visibleSensorKeys.map((sensorKey) => {
        const meta = this.availableSensors.get(sensorKey);
        return meta?.side || sensorKey;
      }),
    );

    this.sensorStates.forEach((state, displayKey) => {
      if (!nextDisplayKeys.has(displayKey)) {
        state.unsubscribeParams?.();
        state.processor?.destroy?.();
        this.sensorStates.delete(displayKey);
      }
    });
  }

  _destroyAllProcessors() {
    this.sensorStates.forEach((state) => {
      state.unsubscribeParams?.();
      state.processor?.destroy?.();
    });
    this.sensorStates.clear();
  }

  _emitSummary() {
    const summary = this.getAggregatedSessionSummary();
    this.summaryListeners.forEach((listener) => {
      listener(summary);
    });
  }

  _emitVisibilityChange() {
    const payload = {
      visibleSensorKeys: this.getVisibleSensorKeys(),
      sensorSummary: this.getSensorSummary(),
      visibleStates: this.getVisibleSensorStates(),
    };

    this.visibilityListeners.forEach((listener) => {
      listener(payload);
    });
  }
}

export function createSharedGaitRuntime(options = {}) {
  return new SharedGaitRuntime(options);
}
