export function getTimeAt(timestamps, index, fallbackDt) {
  if (timestamps && Number.isFinite(timestamps[index])) {
    return timestamps[index];
  }

  return index * fallbackDt;
}

export function getDurationBetween(timestamps, startIdx, endIdx, fallbackDt) {
  if (startIdx === null || endIdx === null || startIdx === undefined || endIdx === undefined) {
    return null;
  }

  const startTime = getTimeAt(timestamps, startIdx, fallbackDt);
  const endTime = getTimeAt(timestamps, endIdx, fallbackDt);
  return Math.max(0, endTime - startTime);
}

function median(values) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function findWindowMax(signal, startIdx, endIdx) {
  let maxValue = -Infinity;
  for (let i = Math.max(0, startIdx); i <= Math.min(signal.length - 1, endIdx); i += 1) {
    maxValue = Math.max(maxValue, signal[i]);
  }

  return maxValue;
}

export function findHsCandidateMinima(signal, minProminence, minSeparation, prominenceWindow) {
  const minima = [];

  for (let i = 1; i < signal.length - 1; i += 1) {
    if (signal[i] < signal[i - 1] && signal[i] <= signal[i + 1]) {
      const leftMax = findWindowMax(signal, i - prominenceWindow, i);
      const rightMax = findWindowMax(signal, i, i + prominenceWindow);
      const prominence = Math.min(leftMax - signal[i], rightMax - signal[i]);

      if (prominence >= minProminence) {
        if (minima.length === 0 || (i - minima[minima.length - 1]) >= minSeparation) {
          minima.push(i);
        } else if (signal[i] < signal[minima[minima.length - 1]]) {
          minima[minima.length - 1] = i;
        }
      }
    }
  }

  return minima;
}

function findPositivePeak(signal, startIdx, endIdx) {
  let peak = -Infinity;
  for (let i = Math.max(0, startIdx); i <= Math.min(signal.length - 1, endIdx); i += 1) {
    peak = Math.max(peak, signal[i]);
  }

  return peak > 0 ? peak : null;
}

export function buildHsCandidateExtrema(smoothed, index, envelopeWindowSamples, previousAcceptedIndex) {
  const localEnvelopePeak = findPositivePeak(
    smoothed,
    index - envelopeWindowSamples,
    index + envelopeWindowSamples,
  );
  const interCyclePeak = Number.isInteger(previousAcceptedIndex) && previousAcceptedIndex < index
    ? findPositivePeak(smoothed, previousAcceptedIndex, index)
    : null;

  return {
    hsAbs: Math.abs(smoothed[index]),
    localEnvelopePeakAbs: localEnvelopePeak,
    interCyclePeakAbs: interCyclePeak,
  };
}

export function resolveAdaptiveHsThresholdAbs(candidateExtrema, acceptedExtremaHistory, options) {
  const recentExtrema = acceptedExtremaHistory.slice(-options.historySize);
  const previousHsAbs = recentExtrema
    .map((extrema) => extrema.hsAbs)
    .filter(Number.isFinite);
  const previousPeakAbs = recentExtrema
    .map((extrema) => extrema.interCyclePeakAbs ?? extrema.localEnvelopePeakAbs)
    .filter(Number.isFinite);
  const candidatePeakAbs = candidateExtrema.interCyclePeakAbs ?? candidateExtrema.localEnvelopePeakAbs;

  const thresholdComponents = [
    Number.isFinite(candidatePeakAbs) ? candidatePeakAbs * options.envelopeScale : null,
    previousPeakAbs.length ? median(previousPeakAbs) * options.previousPeakScale : null,
    previousHsAbs.length ? median(previousHsAbs) * options.previousHsScale : null,
  ].filter(Number.isFinite);

  if (!thresholdComponents.length) {
    return options.ceilingAbs;
  }

  return clamp(
    median(thresholdComponents),
    options.floorAbs,
    options.ceilingAbs,
  );
}

export function resolveCycleTemporalMetrics(strideTime, measuredStanceTime, previousValidStanceRatio, usePreviousValidStanceFallback) {
  if (!Number.isFinite(strideTime) || strideTime <= 0) {
    return {
      stanceTime: null,
      swingTime: null,
      stancePct: null,
      swingPct: null,
      temporalSource: 'unresolved',
      nextValidStanceRatio: previousValidStanceRatio,
    };
  }

  if (Number.isFinite(measuredStanceTime)) {
    const stanceTime = Math.max(0, Math.min(strideTime, measuredStanceTime));
    const swingTime = Math.max(0, strideTime - stanceTime);
    const stancePct = (stanceTime / strideTime) * 100;
    const swingPct = 100 - stancePct;

    return {
      stanceTime,
      swingTime,
      stancePct,
      swingPct,
      temporalSource: 'measured-to',
      nextValidStanceRatio: stanceTime / strideTime,
    };
  }

  if (usePreviousValidStanceFallback && Number.isFinite(previousValidStanceRatio)) {
    const boundedRatio = Math.max(0, Math.min(1, previousValidStanceRatio));
    const stanceTime = strideTime * boundedRatio;
    const swingTime = Math.max(0, strideTime - stanceTime);
    const stancePct = boundedRatio * 100;
    const swingPct = 100 - stancePct;

    return {
      stanceTime,
      swingTime,
      stancePct,
      swingPct,
      temporalSource: 'previous-valid-ratio',
      nextValidStanceRatio: previousValidStanceRatio,
    };
  }

  return {
    stanceTime: null,
    swingTime: null,
    stancePct: null,
    swingPct: null,
    temporalSource: 'unresolved',
    nextValidStanceRatio: previousValidStanceRatio,
  };
}
