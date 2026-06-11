import {
  buildHsCandidateExtrema,
  findHsCandidateMinima,
  getDurationBetween,
  getTimeAt,
  resolveAdaptiveHsThresholdAbs,
  resolveCycleTemporalMetrics,
} from './gaitEventDetectorInternals.js';
import { findLocalMinima, findZeroCrossing, movingAverage } from './signalUtils.js';

export class GaitEventDetector {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 100;
    this.hsProminence = options.hsProminence || 80;
    this.toProminence = options.toProminence || 30;
    this.minStrideTime = options.minStrideTime || 0.6;
    this.maxStrideTime = options.maxStrideTime ?? 2.0;
    this.smoothingWindow = options.smoothingWindow || 5;
    this.stillAngularVelocityAbs = options.stillAngularVelocityAbs ?? 10;
    this.stillDurationSeconds = options.stillDurationSeconds ?? 0.2;
    this.minSwingAngularVelocityAbs = options.minSwingAngularVelocityAbs ?? 20;
    this.minOpenStrideTimeSeconds = options.minOpenStrideTimeSeconds ?? 0.3;
    this.toSearchStartPct = options.toSearchStartPct ?? 0.35;
    this.toSearchEndPct = options.toSearchEndPct ?? 0.75;
    this.hsVelocityThreshold = options.hsVelocityThreshold ?? -50;
    this.hsVelocityThresholdFloorAbs = options.hsVelocityThresholdFloorAbs ?? 18;
    this.hsVelocityThresholdCeilingAbs = Math.abs(this.hsVelocityThreshold);
    this.hsEnvelopeScale = options.hsEnvelopeScale ?? 0.35;
    this.hsPreviousPeakScale = options.hsPreviousPeakScale ?? 0.35;
    this.hsPreviousHsScale = options.hsPreviousHsScale ?? 0.75;
    this.hsAdaptiveHistorySize = options.hsAdaptiveHistorySize ?? 3;
    this.hsEnvelopeWindowSeconds = options.hsEnvelopeWindowSeconds ?? 0.8;
    this.usePreviousValidStanceFallback = options.usePreviousValidStanceFallback ?? true;
  }

  detect(angVel, timestamps) {
    const dt = 1.0 / this.sampleRate;

    const smoothed = movingAverage(angVel, this.smoothingWindow);
    const minHsDistance = Math.floor(this.minStrideTime * this.sampleRate * 0.8);
    const hsEnvelopeWindowSamples = Math.max(
      minHsDistance,
      Math.round(this.hsEnvelopeWindowSeconds * this.sampleRate),
    );
    const allMinima = findHsCandidateMinima(
      smoothed,
      this.hsProminence,
      minHsDistance,
      hsEnvelopeWindowSamples,
    );
    const acceptedHsExtremaHistory = [];
    const heelStrikes = [];

    for (const idx of allMinima) {
      const previousAcceptedIndex = heelStrikes.length ? heelStrikes[heelStrikes.length - 1] : null;
      const candidateExtrema = buildHsCandidateExtrema(
        smoothed,
        idx,
        hsEnvelopeWindowSamples,
        previousAcceptedIndex,
      );
      const adaptiveThresholdAbs = resolveAdaptiveHsThresholdAbs(candidateExtrema, acceptedHsExtremaHistory, {
        floorAbs: this.hsVelocityThresholdFloorAbs,
        ceilingAbs: this.hsVelocityThresholdCeilingAbs,
        envelopeScale: this.hsEnvelopeScale,
        previousPeakScale: this.hsPreviousPeakScale,
        previousHsScale: this.hsPreviousHsScale,
        historySize: this.hsAdaptiveHistorySize,
      });

      if (candidateExtrema.hsAbs < adaptiveThresholdAbs) {
        continue;
      }

      heelStrikes.push(idx);
      acceptedHsExtremaHistory.push(candidateExtrema);
    }

    const events = [];
    const rawStrides = [];
    let previousValidStanceRatio = null;

    for (const idx of heelStrikes) {
      events.push({
        index: idx,
        time: getTimeAt(timestamps, idx, dt),
        type: 'HS',
      });
    }

    for (let i = 0; i < heelStrikes.length - 1; i += 1) {
      const hsStartIdx = heelStrikes[i];
      const hsEndIdx = heelStrikes[i + 1];
      const strideSamples = hsEndIdx - hsStartIdx;
      const strideTime = getDurationBetween(timestamps, hsStartIdx, hsEndIdx, dt);

      if (strideTime === null || strideTime < this.minStrideTime || strideTime > this.maxStrideTime) {
        continue;
      }

      const msvIdx = findZeroCrossing(
        smoothed,
        hsStartIdx + 5,
        hsStartIdx + Math.floor(strideSamples * 0.4),
      );

      if (msvIdx !== null) {
        events.push({
          index: msvIdx,
          time: getTimeAt(timestamps, msvIdx, dt),
          type: 'MSV',
        });
      }

      let toIdx = null;
      const toSearchStart = hsStartIdx + Math.floor(strideSamples * this.toSearchStartPct);
      const toSearchEnd = Math.min(hsEndIdx, hsStartIdx + Math.floor(strideSamples * this.toSearchEndPct));
      if (toSearchEnd > toSearchStart + 2) {
        const toMinima = findLocalMinima(
          smoothed.slice(toSearchStart, toSearchEnd),
          this.toProminence,
          10,
        );

        if (toMinima.length > 0) {
          toIdx = toMinima[0] + toSearchStart;
          events.push({
            index: toIdx,
            time: getTimeAt(timestamps, toIdx, dt),
            type: 'TO',
          });
        }
      }

      const measuredStanceTime = toIdx !== null
        ? getDurationBetween(timestamps, hsStartIdx, toIdx, dt)
        : null;
      const temporalMetrics = resolveCycleTemporalMetrics(
        strideTime,
        measuredStanceTime,
        previousValidStanceRatio,
        this.usePreviousValidStanceFallback,
      );
      previousValidStanceRatio = temporalMetrics.nextValidStanceRatio;

      rawStrides.push({
        hsStart: { index: hsStartIdx, time: getTimeAt(timestamps, hsStartIdx, dt), type: 'HS' },
        hsEnd: { index: hsEndIdx, time: getTimeAt(timestamps, hsEndIdx, dt), type: 'HS' },
        to: toIdx !== null ? { index: toIdx, time: getTimeAt(timestamps, toIdx, dt), type: 'TO' } : null,
        msv: msvIdx !== null ? { index: msvIdx, time: getTimeAt(timestamps, msvIdx, dt), type: 'MSV' } : null,
        strideTime,
        stanceTime: temporalMetrics.stanceTime,
        swingTime: temporalMetrics.swingTime,
        stancePct: temporalMetrics.stancePct,
        swingPct: temporalMetrics.swingPct,
        temporalSource: temporalMetrics.temporalSource,
      });
    }

    if (heelStrikes.length >= 1 && timestamps && timestamps.length > 0) {
      const hsStartIdx = heelStrikes[heelStrikes.length - 1];
      const sampleCount = smoothed.length;

      let stillStartIdx = null;
      let endIdx = null;

      for (let i = hsStartIdx; i < sampleCount; i += 1) {
        if (Math.abs(smoothed[i]) <= this.stillAngularVelocityAbs) {
          if (stillStartIdx === null) {
            stillStartIdx = i;
          }

          const stillDuration = getDurationBetween(timestamps, stillStartIdx, i, dt);
          if (stillDuration !== null && stillDuration >= this.stillDurationSeconds) {
            endIdx = i;
            break;
          }
        } else {
          stillStartIdx = null;
        }
      }

      if (endIdx !== null) {
        const strideSamples = endIdx - hsStartIdx;
        const openStrideTime = getDurationBetween(timestamps, hsStartIdx, endIdx, dt);

        if (
          openStrideTime !== null
          && openStrideTime >= this.minOpenStrideTimeSeconds
          && openStrideTime <= this.maxStrideTime
        ) {
          let maxAbsWithin = 0;
          for (let j = hsStartIdx; j <= endIdx; j += 1) {
            maxAbsWithin = Math.max(maxAbsWithin, Math.abs(smoothed[j]));
          }

          if (maxAbsWithin >= this.minSwingAngularVelocityAbs) {
            const msvSearchEnd = hsStartIdx + Math.max(1, Math.floor(strideSamples * 0.4));
            const msvIdx = findZeroCrossing(smoothed, hsStartIdx + 5, msvSearchEnd);

            if (msvIdx !== null) {
              events.push({
                index: msvIdx,
                time: getTimeAt(timestamps, msvIdx, dt),
                type: 'MSV',
              });
            }

            const toSearchStart = hsStartIdx + Math.floor(strideSamples * this.toSearchStartPct);
            const toSearchEnd = Math.min(hsStartIdx + Math.floor(strideSamples * this.toSearchEndPct), endIdx);
            let toIdx = null;

            if (toSearchEnd > toSearchStart + 2) {
              const toMinima = findLocalMinima(
                smoothed.slice(toSearchStart, toSearchEnd),
                this.toProminence,
                10,
              );

              if (toMinima.length > 0) {
                toIdx = toMinima[0] + toSearchStart;
                events.push({
                  index: toIdx,
                  time: getTimeAt(timestamps, toIdx, dt),
                  type: 'TO',
                });
              }
            }

            const measuredStanceTime = toIdx !== null
              ? getDurationBetween(timestamps, hsStartIdx, toIdx, dt)
              : null;
            const temporalMetrics = resolveCycleTemporalMetrics(
              openStrideTime,
              measuredStanceTime,
              previousValidStanceRatio,
              this.usePreviousValidStanceFallback,
            );
            previousValidStanceRatio = temporalMetrics.nextValidStanceRatio;

            rawStrides.push({
              hsStart: { index: hsStartIdx, time: getTimeAt(timestamps, hsStartIdx, dt), type: 'HS' },
              hsEnd: { index: endIdx, time: getTimeAt(timestamps, endIdx, dt), type: 'HS' },
              to: toIdx !== null ? { index: toIdx, time: getTimeAt(timestamps, toIdx, dt), type: 'TO' } : null,
              msv: msvIdx !== null ? { index: msvIdx, time: getTimeAt(timestamps, msvIdx, dt), type: 'MSV' } : null,
              strideTime: openStrideTime,
              stanceTime: temporalMetrics.stanceTime,
              swingTime: temporalMetrics.swingTime,
              stancePct: temporalMetrics.stancePct,
              swingPct: temporalMetrics.swingPct,
              temporalSource: temporalMetrics.temporalSource,
            });
          }
        }
      }
    }

    const cycles = rawStrides.filter((cycle) => cycle?.hsStart && cycle?.hsEnd);

    events.sort((a, b) => a.index - b.index);
    return { events, cycles };
  }
}
