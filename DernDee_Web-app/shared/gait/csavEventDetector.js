import { CSAV_DEFAULT_OPTIONS } from './csavConstants.js';
import {
  buildHsCandidateExtrema,
  findHsCandidateMinima,
  getDurationBetween,
  getTimeAt,
  resolveAdaptiveHsThresholdAbs,
  resolveCycleTemporalMetrics,
} from './gaitEventDetectorInternals.js';
import { findLocalMinima, findZeroCrossing, movingAverage } from './signalUtils.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function findPositivePeakIndex(signal, startIdx, endIdx, minAbs) {
  let peakIdx = null;
  let peakValue = -Infinity;

  for (let i = Math.max(0, startIdx); i <= Math.min(signal.length - 1, endIdx); i += 1) {
    if (signal[i] > peakValue) {
      peakValue = signal[i];
      peakIdx = i;
    }
  }

  return peakValue >= minAbs ? peakIdx : null;
}

function findZeroCrossingBeforePeak(signal, peakIdx, maxLookback) {
  const startIdx = Math.max(1, peakIdx - maxLookback);
  for (let i = peakIdx; i >= startIdx; i -= 1) {
    if (signal[i - 1] < 0 && signal[i] >= 0) {
      return i;
    }
  }

  return null;
}

function findZeroCrossingAfterPeak(signal, peakIdx, maxLookahead) {
  const endIdx = Math.min(signal.length - 2, peakIdx + maxLookahead);
  for (let i = peakIdx; i <= endIdx; i += 1) {
    if (signal[i - 1] > 0 && signal[i] <= 0) {
      return i;
    }
  }

  return null;
}

function buildPhaseCurve(signal, timestamps, startIdx, endIdx, mode, dtFallback) {
  const values = [];
  let cumulative = 0;

  for (let i = Math.max(startIdx + 1, 1); i <= endIdx; i += 1) {
    const dt = getDurationBetween(timestamps, i - 1, i, dtFallback) || dtFallback;
    const previous = signal[i - 1];
    const current = signal[i];
    let contribution = 0;

    if (mode === 'stance-negative') {
      contribution = ((Math.max(0, -previous) + Math.max(0, -current)) / 2) * dt;
    } else {
      contribution = ((Math.max(0, previous) + Math.max(0, current)) / 2) * dt;
    }

    cumulative += contribution;
    values.push({ index: i, value: cumulative });
  }

  return {
    values,
    total: cumulative,
  };
}

function findThresholdIndex(curve, total, fraction, comparator) {
  if (!curve.values.length || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  const threshold = total * fraction;
  for (const point of curve.values) {
    if (comparator(point.value, threshold)) {
      return point.index;
    }
  }

  return null;
}

function scoreThresholdMatch(actualFraction, targetFraction) {
  const delta = Math.abs(actualFraction - targetFraction);
  return clamp(1 - delta / Math.max(targetFraction, 0.05), 0.2, 1);
}

function buildEvent(index, timestamps, dt, type, confidence, source, resolved) {
  return {
    index,
    time: getTimeAt(timestamps, index, dt),
    type,
    confidence,
    source,
    resolved,
  };
}

function pushUniqueEvent(events, event) {
  if (!event || !Number.isInteger(event.index)) {
    return;
  }

  const duplicate = events.some((existing) => (
    existing.index === event.index && existing.type === event.type
  ));

  if (!duplicate) {
    events.push(event);
  }
}

function resolveAdaptiveHsProminence(smoothed, options) {
  const magnitudes = smoothed.map((value) => Math.abs(value)).filter(Number.isFinite);
  if (!magnitudes.length) {
    return options.hsProminence;
  }

  const sorted = [...magnitudes].sort((left, right) => left - right);
  const medianAbs = sorted[Math.floor(sorted.length / 2)] ?? options.hsProminence;
  const envelopePeak = Math.max(...magnitudes);
  const adaptiveProminence = Math.max(
    options.hsProminenceFloor ?? 10,
    Math.min(options.hsProminence, envelopePeak * 0.22, medianAbs * 0.9),
  );

  return clamp(adaptiveProminence, options.hsProminenceFloor ?? 10, options.hsProminence);
}

function detectHeelStrikes(smoothed, options) {
  const minHsDistance = Math.floor(options.minStrideTime * options.sampleRate * options.minHsSeparationScale);
  const hsEnvelopeWindowSamples = Math.max(
    minHsDistance,
    Math.round(options.hsEnvelopeWindowSeconds * options.sampleRate),
  );
  const hsProminence = resolveAdaptiveHsProminence(smoothed, options);
  const allMinima = findHsCandidateMinima(
    smoothed,
    hsProminence,
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
      floorAbs: options.hsVelocityThresholdFloorAbs,
      ceilingAbs: options.hsVelocityThresholdCeilingAbs,
      envelopeScale: options.hsEnvelopeScale,
      previousPeakScale: options.hsPreviousPeakScale,
      previousHsScale: options.hsPreviousHsScale,
      historySize: options.hsAdaptiveHistorySize,
    });

    if (candidateExtrema.hsAbs < adaptiveThresholdAbs) {
      continue;
    }

    heelStrikes.push(idx);
    acceptedHsExtremaHistory.push(candidateExtrema);
  }

  return heelStrikes;
}

function detectStridePhases(smoothed, timestamps, icIdx, nextIcIdx, options) {
  const dt = 1 / options.sampleRate;
  const strideTime = getDurationBetween(timestamps, icIdx, nextIcIdx, dt);

  if (strideTime === null || strideTime < options.minStrideTime || strideTime > options.maxStrideTime) {
    return null;
  }

  let peakIdx = findPositivePeakIndex(smoothed, icIdx + 1, nextIcIdx - 1, options.swingPeakMinAbs);
  if (peakIdx === null) {
    peakIdx = findPositivePeakIndex(
      smoothed,
      icIdx + 1,
      nextIcIdx - 1,
      options.swingPeakMinAbsFallback ?? 3,
    );
  }
  if (peakIdx === null) {
    peakIdx = findPositivePeakIndex(smoothed, icIdx + 1, nextIcIdx - 1, 0);
  }

  const maxLook = Math.round(1.2 * options.sampleRate);
  const zpIdx = peakIdx !== null ? findZeroCrossingBeforePeak(smoothed, peakIdx, maxLook) : null;
  const znIdx = peakIdx !== null ? findZeroCrossingAfterPeak(smoothed, peakIdx, maxLook) : null;

  const legacyHints = buildLegacyCycleFallback(smoothed, timestamps, icIdx, nextIcIdx, options, null);
  let stanceEndIdx = Number.isInteger(zpIdx) ? zpIdx : peakIdx;
  if (!Number.isInteger(stanceEndIdx) || stanceEndIdx <= icIdx) {
    stanceEndIdx = legacyHints?.toIdx
      ?? (peakIdx !== null ? peakIdx : icIdx + Math.max(1, Math.floor((nextIcIdx - icIdx) * 0.6)));
  }

  let swingEndIdx = Number.isInteger(znIdx) ? znIdx : nextIcIdx - 1;
  if (swingEndIdx <= stanceEndIdx) {
    swingEndIdx = Math.max(stanceEndIdx + 1, nextIcIdx - 1);
  }

  const csavSt = buildPhaseCurve(smoothed, timestamps, icIdx, stanceEndIdx, 'stance-negative', dt);
  const csavSw = buildPhaseCurve(
    smoothed,
    timestamps,
    Math.max(stanceEndIdx, icIdx + 1),
    Math.max(swingEndIdx, stanceEndIdx + 1),
    'positive',
    dt,
  );

  const zPcp = strideTime > 0
    ? getDurationBetween(timestamps, icIdx, stanceEndIdx, dt) / strideTime
    : null;

  const hrCorrectionSeconds = options.hrStrideTimeCorrection.intercept
    + options.hrStrideTimeCorrection.slope * strideTime;
  const faCorrectionSeconds = Number.isFinite(zPcp)
    ? options.faZpCorrection.intercept + options.faZpCorrection.slope * zPcp
    : 0;

  let hrIdx = findThresholdIndex(csavSt, csavSt.total, options.hrCsavStFraction, (value, threshold) => value >= threshold);
  let toIdx = findThresholdIndex(csavSt, csavSt.total, options.toCsavStFraction, (value, threshold) => value >= threshold);
  let ffIdx = findThresholdIndex(csavSt, csavSt.total, options.ffCsavStFraction, (value, threshold) => value >= threshold);
  let faIdx = findThresholdIndex(csavSw, csavSw.total, options.faCsavSwFraction, (value, threshold) => value >= threshold);
  let tbvIdx = findThresholdIndex(csavSw, csavSw.total, options.tbvCsavSwFraction, (value, threshold) => value >= threshold);

  if (!Number.isInteger(toIdx) && Number.isInteger(legacyHints?.toIdx)) {
    toIdx = legacyHints.toIdx;
  }

  if (Number.isInteger(hrIdx) && Number.isFinite(hrCorrectionSeconds)) {
    const correctedTime = getTimeAt(timestamps, hrIdx, dt) - hrCorrectionSeconds;
    while (hrIdx > icIdx && getTimeAt(timestamps, hrIdx, dt) > correctedTime) {
      hrIdx -= 1;
    }
  }

  if (Number.isInteger(faIdx) && Number.isFinite(faCorrectionSeconds)) {
    const correctedTime = getTimeAt(timestamps, faIdx, dt) - faCorrectionSeconds;
    while (faIdx > stanceEndIdx && getTimeAt(timestamps, faIdx, dt) > correctedTime) {
      faIdx -= 1;
    }
  }

  if (Number.isInteger(ffIdx) && Number.isInteger(hrIdx) && ffIdx >= hrIdx) {
    ffIdx = null;
  }

  if (Number.isInteger(toIdx) && Number.isInteger(hrIdx) && toIdx < hrIdx) {
    toIdx = null;
  }

  if (!Number.isInteger(toIdx) && Number.isInteger(legacyHints?.toIdx)) {
    toIdx = legacyHints.toIdx;
  }

  const getFraction = (curve, index) => {
    const point = curve.values.find((entry) => entry.index === index);
    if (!point || !Number.isFinite(curve.total) || curve.total <= 0) {
      return null;
    }
    return point.value / curve.total;
  };

  const phases = {
    ic: buildEvent(icIdx, timestamps, dt, 'IC', 0.95, 'csav', true),
    hs: buildEvent(icIdx, timestamps, dt, 'HS', 0.95, 'csav', true),
    ff: ffIdx !== null
      ? buildEvent(ffIdx, timestamps, dt, 'FF', scoreThresholdMatch(getFraction(csavSt, ffIdx), options.ffCsavStFraction), 'csav', true)
      : buildEvent(icIdx, timestamps, dt, 'FF', 0.2, 'csav', false),
    hr: hrIdx !== null
      ? buildEvent(hrIdx, timestamps, dt, 'HR', scoreThresholdMatch(getFraction(csavSt, hrIdx), options.hrCsavStFraction), 'csav', true)
      : null,
    to: toIdx !== null
      ? buildEvent(
        toIdx,
        timestamps,
        dt,
        'TO',
        legacyHints?.toIdx === toIdx
          ? 0.72
          : scoreThresholdMatch(getFraction(csavSt, toIdx), options.toCsavStFraction),
        legacyHints?.toIdx === toIdx ? 'legacy-fallback' : 'csav',
        true,
      )
      : null,
    fa: faIdx !== null
      ? buildEvent(faIdx, timestamps, dt, 'FA', scoreThresholdMatch(getFraction(csavSw, faIdx), options.faCsavSwFraction), 'csav', true)
      : null,
    tbv: tbvIdx !== null
      ? buildEvent(tbvIdx, timestamps, dt, 'TBV', scoreThresholdMatch(getFraction(csavSw, tbvIdx), options.tbvCsavSwFraction), 'csav', true)
      : null,
  };

  return {
    phases,
    csavStTotal: csavSt.total,
    csavSwTotal: csavSw.total,
    zPcp,
    strideTime,
    toIdx,
    zpIdx,
    znIdx,
  };
}

function buildLegacyCycleFallback(smoothed, timestamps, hsStartIdx, hsEndIdx, options, previousValidStanceRatio) {
  const dt = 1 / options.sampleRate;
  const strideSamples = hsEndIdx - hsStartIdx;
  const strideTime = getDurationBetween(timestamps, hsStartIdx, hsEndIdx, dt);

  if (strideTime === null || strideTime < options.minStrideTime || strideTime > options.maxStrideTime) {
    return null;
  }

  const msvIdx = findZeroCrossing(
    smoothed,
    hsStartIdx + 5,
    hsStartIdx + Math.floor(strideSamples * 0.4),
  );

  let toIdx = null;
  const toSearchStart = hsStartIdx + Math.floor(strideSamples * 0.2);
  const toSearchEnd = Math.min(hsEndIdx, hsStartIdx + Math.floor(strideSamples * 0.8));
  if (toSearchEnd > toSearchStart + 2) {
    const toMinima = findLocalMinima(
      smoothed.slice(toSearchStart, toSearchEnd),
      options.toProminence ?? 20,
      10,
    );
    if (toMinima.length > 0) {
      toIdx = toMinima[0] + toSearchStart;
    }
  }

  const measuredStanceTime = toIdx !== null
    ? getDurationBetween(timestamps, hsStartIdx, toIdx, dt)
    : null;
  const temporalMetrics = resolveCycleTemporalMetrics(
    strideTime,
    measuredStanceTime,
    previousValidStanceRatio,
    options.usePreviousValidStanceFallback,
  );

  return {
    hsStartIdx,
    hsEndIdx,
    strideTime,
    toIdx,
    msvIdx,
    temporalMetrics,
  };
}

function pushLegacyCycleFromFallback(cycles, events, fallback, timestamps, dt) {
  if (!fallback) {
    return fallback?.temporalMetrics?.nextValidStanceRatio ?? null;
  }

  const icStart = buildEvent(fallback.hsStartIdx, timestamps, dt, 'IC', 0.7, 'legacy-fallback', true);
  const icEnd = buildEvent(fallback.hsEndIdx, timestamps, dt, 'IC', 0.7, 'legacy-fallback', true);
  const hsStart = buildEvent(fallback.hsStartIdx, timestamps, dt, 'HS', 0.7, 'legacy-fallback', true);
  const hsEnd = buildEvent(fallback.hsEndIdx, timestamps, dt, 'HS', 0.7, 'legacy-fallback', true);

  pushUniqueEvent(events, icStart);
  pushUniqueEvent(events, hsStart);
  pushUniqueEvent(events, icEnd);
  pushUniqueEvent(events, hsEnd);

  const msvEvent = fallback.msvIdx !== null
    ? buildEvent(fallback.msvIdx, timestamps, dt, 'MSV', 0.6, 'legacy-fallback', true)
    : null;
  pushUniqueEvent(events, msvEvent);

  const toEvent = fallback.toIdx !== null
    ? buildEvent(fallback.toIdx, timestamps, dt, 'TO', 0.75, 'legacy-fallback', true)
    : null;
  pushUniqueEvent(events, toEvent);

  cycles.push({
    hsStart: icStart,
    hsEnd: icEnd,
    to: toEvent,
    msv: msvEvent,
    ff: null,
    hr: null,
    fa: null,
    tbv: null,
    ic: icStart,
    csavPhases: null,
    phaseConfidences: {},
    strideTime: fallback.strideTime,
    stanceTime: fallback.temporalMetrics.stanceTime,
    swingTime: fallback.temporalMetrics.swingTime,
    stancePct: fallback.temporalMetrics.stancePct,
    swingPct: fallback.temporalMetrics.swingPct,
    temporalSource: fallback.temporalMetrics.temporalSource,
    detector: 'legacy-fallback',
  });

  return fallback.temporalMetrics.nextValidStanceRatio;
}

export class CsavEventDetector {
  constructor(options = {}) {
    this.options = { ...CSAV_DEFAULT_OPTIONS, ...options };
  }

  detect(angVel, timestamps) {
    const options = this.options;
    const dt = 1 / options.sampleRate;
    const smoothed = movingAverage(angVel, options.smoothingWindow);
    const events = [];
    const cycles = [];
    let previousValidStanceRatio = null;

    const heelStrikes = detectHeelStrikes(smoothed, options);

    for (let i = 0; i < heelStrikes.length - 1; i += 1) {
      const icIdx = heelStrikes[i];
      const nextIcIdx = heelStrikes[i + 1];
      const stridePhases = detectStridePhases(smoothed, timestamps, icIdx, nextIcIdx, options);

      if (!stridePhases) {
        previousValidStanceRatio = pushLegacyCycleFromFallback(
          cycles,
          events,
          buildLegacyCycleFallback(smoothed, timestamps, icIdx, nextIcIdx, options, previousValidStanceRatio),
          timestamps,
          dt,
        ) ?? previousValidStanceRatio;
        continue;
      }

      Object.values(stridePhases.phases).forEach((phaseEvent) => pushUniqueEvent(events, phaseEvent));

      const measuredStanceTime = stridePhases.phases.to?.resolved && Number.isInteger(stridePhases.phases.to.index)
        ? getDurationBetween(timestamps, icIdx, stridePhases.phases.to.index, dt)
        : null;
      const temporalMetrics = resolveCycleTemporalMetrics(
        stridePhases.strideTime,
        measuredStanceTime,
        previousValidStanceRatio,
        options.usePreviousValidStanceFallback,
      );
      previousValidStanceRatio = temporalMetrics.nextValidStanceRatio;

      const phaseConfidences = Object.fromEntries(
        Object.entries(stridePhases.phases)
          .filter(([, phaseEvent]) => phaseEvent)
          .map(([key, phaseEvent]) => [key, phaseEvent.confidence]),
      );

      cycles.push({
        hsStart: stridePhases.phases.ic,
        hsEnd: buildEvent(nextIcIdx, timestamps, dt, 'IC', 0.95, 'csav', true),
        to: stridePhases.phases.to,
        msv: stridePhases.phases.tbv,
        ff: stridePhases.phases.ff,
        hr: stridePhases.phases.hr,
        fa: stridePhases.phases.fa,
        tbv: stridePhases.phases.tbv,
        ic: stridePhases.phases.ic,
        csavPhases: stridePhases.phases,
        phaseConfidences,
        csavStTotal: stridePhases.csavStTotal,
        csavSwTotal: stridePhases.csavSwTotal,
        strideTime: stridePhases.strideTime,
        stanceTime: temporalMetrics.stanceTime,
        swingTime: temporalMetrics.swingTime,
        stancePct: temporalMetrics.stancePct,
        swingPct: temporalMetrics.swingPct,
        temporalSource: stridePhases.phases.to?.resolved ? 'csav-measured-to' : temporalMetrics.temporalSource,
        detector: 'csav-7phase',
      });
    }

    if (!cycles.length && heelStrikes.length >= 2) {
      for (let i = 0; i < heelStrikes.length - 1; i += 1) {
        previousValidStanceRatio = pushLegacyCycleFromFallback(
          cycles,
          events,
          buildLegacyCycleFallback(
            smoothed,
            timestamps,
            heelStrikes[i],
            heelStrikes[i + 1],
            options,
            previousValidStanceRatio,
          ),
          timestamps,
          dt,
        ) ?? previousValidStanceRatio;
      }
    }

    if (heelStrikes.length >= 1 && timestamps.length > 0) {
      const hsStartIdx = heelStrikes[heelStrikes.length - 1];
      const sampleCount = smoothed.length;
      let stillStartIdx = null;
      let endIdx = null;

      for (let i = hsStartIdx; i < sampleCount; i += 1) {
        if (Math.abs(smoothed[i]) <= options.stillAngularVelocityAbs) {
          if (stillStartIdx === null) {
            stillStartIdx = i;
          }

          const stillDuration = getDurationBetween(timestamps, stillStartIdx, i, dt);
          if (stillDuration !== null && stillDuration >= options.stillDurationSeconds) {
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
          && openStrideTime >= options.minOpenStrideTimeSeconds
          && openStrideTime <= options.maxStrideTime
        ) {
          let maxAbsWithin = 0;
          for (let j = hsStartIdx; j <= endIdx; j += 1) {
            maxAbsWithin = Math.max(maxAbsWithin, Math.abs(smoothed[j]));
          }

          if (maxAbsWithin >= options.minSwingAngularVelocityAbs) {
            const openFallback = buildLegacyCycleFallback(
              smoothed,
              timestamps,
              hsStartIdx,
              endIdx,
              options,
              previousValidStanceRatio,
            );

            if (openFallback) {
              previousValidStanceRatio = pushLegacyCycleFromFallback(
                cycles,
                events,
                openFallback,
                timestamps,
                dt,
              ) ?? previousValidStanceRatio;
            } else {
              const msvSearchEnd = hsStartIdx + Math.max(1, Math.floor(strideSamples * 0.4));
              const msvIdx = findZeroCrossing(smoothed, hsStartIdx + 5, msvSearchEnd);
              const toSearchStart = hsStartIdx + Math.floor(strideSamples * (options.toSearchStartPct ?? 0.2));
              const toSearchEnd = Math.min(
                hsStartIdx + Math.floor(strideSamples * (options.toSearchEndPct ?? 0.8)),
                endIdx,
              );
              let toIdx = null;

              if (toSearchEnd > toSearchStart + 2) {
                const toMinima = findLocalMinima(
                  smoothed.slice(toSearchStart, toSearchEnd),
                  options.toProminence ?? 20,
                  10,
                );
                if (toMinima.length > 0) {
                  toIdx = toMinima[0] + toSearchStart;
                }
              }

              const measuredStanceTime = toIdx !== null
                ? getDurationBetween(timestamps, hsStartIdx, toIdx, dt)
                : null;
              const temporalMetrics = resolveCycleTemporalMetrics(
                openStrideTime,
                measuredStanceTime,
                previousValidStanceRatio,
                options.usePreviousValidStanceFallback,
              );
              previousValidStanceRatio = temporalMetrics.nextValidStanceRatio;

              const icStart = buildEvent(hsStartIdx, timestamps, dt, 'IC', 0.7, 'legacy-open', true);
              const icEnd = buildEvent(endIdx, timestamps, dt, 'IC', 0.7, 'legacy-open', true);
              pushUniqueEvent(events, icStart);
              pushUniqueEvent(events, buildEvent(hsStartIdx, timestamps, dt, 'HS', 0.7, 'legacy-open', true));
              pushUniqueEvent(events, icEnd);
              pushUniqueEvent(events, buildEvent(endIdx, timestamps, dt, 'HS', 0.7, 'legacy-open', true));

              const msvEvent = msvIdx !== null
                ? buildEvent(msvIdx, timestamps, dt, 'MSV', 0.6, 'legacy-open', true)
                : null;
              pushUniqueEvent(events, msvEvent);

              const toEvent = toIdx !== null
                ? buildEvent(toIdx, timestamps, dt, 'TO', 0.75, 'legacy-open', true)
                : null;
              pushUniqueEvent(events, toEvent);

              cycles.push({
                hsStart: icStart,
                hsEnd: icEnd,
                to: toEvent,
                msv: msvEvent,
                ff: null,
                hr: null,
                fa: null,
                tbv: null,
                ic: icStart,
                csavPhases: null,
                phaseConfidences: {},
                strideTime: openStrideTime,
                stanceTime: temporalMetrics.stanceTime,
                swingTime: temporalMetrics.swingTime,
                stancePct: temporalMetrics.stancePct,
                swingPct: temporalMetrics.swingPct,
                temporalSource: temporalMetrics.temporalSource,
                detector: 'legacy-open',
              });
            }
          }
        }
      }
    }

    events.sort((left, right) => left.index - right.index);

    const cycleConfidence = cycles.length
      ? cycles.reduce((sum, cycle) => {
        const values = Object.values(cycle.phaseConfidences || {}).filter(Number.isFinite);
        if (!values.length) {
          return sum;
        }
        return sum + values.reduce((innerSum, value) => innerSum + value, 0) / values.length;
      }, 0) / cycles.length
      : 0;

    return {
      events,
      cycles,
      detector: 'csav-7phase',
      cycleConfidence,
    };
  }
}
