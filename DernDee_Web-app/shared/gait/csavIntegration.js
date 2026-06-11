/**
 * Phase 3: CSAV-informed spatial integration (PRD §8.6).
 * Swing window: Toe Off (TO) → landing (IC when available, else ZUPT still / stance window).
 */

const SAMPLE_RATE = 100;
const DT = 1 / SAMPLE_RATE;
const MIN_SWING_INTEGRATION_SAMPLES = Math.max(6, Math.round(0.12 * SAMPLE_RATE));
const STANCE_WINDOW_MATCH_GAP_SAMPLES = Math.max(6, Math.round(0.14 * SAMPLE_RATE));
const POST_IC_STANCE_SAMPLES = Math.max(4, Math.round(0.12 * SAMPLE_RATE));
const MAX_STRIDE_SECONDS = 4.0;
const ZUPT_STILL_ANGULAR_VELOCITY_ABS = 10;
const ZUPT_STILL_DURATION_SECONDS = 0.15;

export const CSAV_SWING_INTEGRATION_SOURCES = new Set([
  'csav-to-ic',
  'csav-to-zupt-stance',
  'csav-to-zupt-still',
  'to-ic-heuristic',
  'to-zupt-stance',
  'to-zupt-still',
]);

function phaseIndex(phaseEvent) {
  return Number.isInteger(phaseEvent?.index) ? phaseEvent.index : null;
}

function getDurationBetween(timestamps, startIdx, endIdx, dt = DT) {
  if (!Number.isInteger(startIdx) || !Number.isInteger(endIdx) || endIdx < startIdx) {
    return null;
  }

  const startTime = timestamps?.[startIdx];
  const endTime = timestamps?.[endIdx];
  if (Number.isFinite(startTime) && Number.isFinite(endTime)) {
    return endTime - startTime;
  }

  return (endIdx - startIdx) * dt;
}

/**
 * Resolve TO index from cycle phases or detected event list.
 */
export function resolveCycleToIndex(cycle, events = []) {
  const icIdx = phaseIndex(cycle?.ic) ?? phaseIndex(cycle?.hsStart);
  const nextIcIdx = phaseIndex(cycle?.hsEnd);
  const cycleTo = phaseIndex(cycle?.to);

  if (Number.isInteger(cycleTo) && Number.isInteger(icIdx) && cycleTo > icIdx) {
    if (!Number.isInteger(nextIcIdx) || cycleTo < nextIcIdx) {
      return cycleTo;
    }
  }

  if (!Number.isInteger(icIdx)) {
    return null;
  }

  const toCandidates = events
    .filter((event) => event?.type === 'TO' && Number.isInteger(event.index))
    .filter((event) => event.index > icIdx)
    .filter((event) => !Number.isInteger(nextIcIdx) || event.index < nextIcIdx)
    .sort((left, right) => right.index - left.index);

  return toCandidates[0]?.index ?? null;
}

function buildIntegrationWindow(startIdx, endIdx, timestamps, source, measuresStepLength = false) {
  return {
    startIdx,
    endIdx,
    startTime: Number.isFinite(timestamps?.[startIdx]) ? timestamps[startIdx] : null,
    endTime: Number.isFinite(timestamps?.[endIdx]) ? timestamps[endIdx] : null,
    threshold: null,
    source,
    measuresStepLength,
    swingEndMethod: source.includes('zupt') ? 'zupt' : 'ic',
  };
}

function findStanceWindowAroundIndex(stanceWindows, index, preferredDirection = 'before') {
  const containingWindow = stanceWindows.find((window) => window.startIdx <= index && index <= window.endIdx);
  if (containingWindow) {
    return containingWindow;
  }

  const beforeWindows = stanceWindows.filter(
    (window) => window.endIdx < index && (index - window.endIdx) <= STANCE_WINDOW_MATCH_GAP_SAMPLES,
  );
  const afterWindows = stanceWindows.filter(
    (window) => window.startIdx > index && (window.startIdx - index) <= STANCE_WINDOW_MATCH_GAP_SAMPLES,
  );

  if (preferredDirection === 'after') {
    return afterWindows[0] || beforeWindows[beforeWindows.length - 1] || null;
  }

  return beforeWindows[beforeWindows.length - 1] || afterWindows[0] || null;
}

function resolveStanceAnchorInRange(stanceWindows, rangeStart, rangeEnd) {
  const overlapping = stanceWindows.filter(
    (window) => window.endIdx >= rangeStart && window.startIdx <= rangeEnd,
  );

  if (overlapping.length) {
    const best = overlapping.reduce((left, right) => (
      (right.endIdx - right.startIdx) > (left.endIdx - left.startIdx) ? right : left
    ));

    return {
      startIdx: Math.max(best.startIdx, rangeStart),
      endIdx: Math.min(best.endIdx, rangeEnd),
    };
  }

  const span = rangeEnd - rangeStart;
  if (span < 3) {
    return { startIdx: rangeStart, endIdx: rangeEnd };
  }

  const margin = Math.max(1, Math.floor(span * 0.2));
  return {
    startIdx: rangeStart + margin,
    endIdx: rangeEnd - margin,
  };
}

function findFirstStanceStartAfter(stanceWindows, toIdx, maxIdx) {
  const candidates = stanceWindows
    .filter((window) => window.startIdx > toIdx && window.startIdx <= maxIdx)
    .sort((left, right) => left.startIdx - right.startIdx);

  return candidates[0]?.startIdx ?? null;
}

/**
 * ZUPT-style landing detector: first sustained low angular-velocity run after TO.
 */
export function findZuPtStillLandingIndex(
  smoothedAngVel,
  timestamps,
  searchStartIdx,
  searchEndIdx,
  options = {},
) {
  const stillAbs = options.stillAngularVelocityAbs ?? ZUPT_STILL_ANGULAR_VELOCITY_ABS;
  const stillDurationSeconds = options.stillDurationSeconds ?? ZUPT_STILL_DURATION_SECONDS;
  const dt = options.dt ?? DT;

  if (!Array.isArray(smoothedAngVel) || !smoothedAngVel.length) {
    return null;
  }

  const end = Math.min(searchEndIdx, smoothedAngVel.length - 1);
  let stillStartIdx = null;

  for (let i = Math.max(0, searchStartIdx); i <= end; i += 1) {
    if (Math.abs(smoothedAngVel[i]) <= stillAbs) {
      if (stillStartIdx === null) {
        stillStartIdx = i;
      }

      const stillDuration = getDurationBetween(timestamps, stillStartIdx, i, dt);
      if (stillDuration !== null && stillDuration >= stillDurationSeconds) {
        return stillStartIdx;
      }
    } else {
      stillStartIdx = null;
    }
  }

  return null;
}

/**
 * Resolve swing end: IC (preferred) → explicit stance window → gyro still (ZUPT).
 */
export function resolveSwingEndIndex({
  toIdx,
  nextIcIdx = null,
  smoothedAngVel = [],
  timestamps = [],
  stanceWindows = [],
  sampleCount = 0,
  searchMaxIdx = null,
}) {
  if (!Number.isInteger(toIdx)) {
    return null;
  }

  const maxIdx = Number.isInteger(searchMaxIdx)
    ? Math.min(searchMaxIdx, sampleCount - 1)
    : (sampleCount - 1);

  if (maxIdx <= toIdx) {
    return null;
  }

  if (Number.isInteger(nextIcIdx) && nextIcIdx > toIdx) {
    const integrationEndIdx = nextIcIdx - 1;
    if (integrationEndIdx > toIdx) {
      return {
        endIdx: integrationEndIdx,
        anchorIdx: nextIcIdx,
        method: 'ic',
        source: 'csav-to-ic',
      };
    }
  }

  const stanceLandingIdx = findFirstStanceStartAfter(stanceWindows, toIdx, maxIdx);
  if (Number.isInteger(stanceLandingIdx) && stanceLandingIdx > toIdx) {
    const integrationEndIdx = Math.max(toIdx + 1, stanceLandingIdx - 1);
    if (integrationEndIdx > toIdx) {
      return {
        endIdx: integrationEndIdx,
        anchorIdx: stanceLandingIdx,
        method: 'zupt-stance',
        source: 'csav-to-zupt-stance',
      };
    }
  }

  const stillLandingIdx = findZuPtStillLandingIndex(
    smoothedAngVel,
    timestamps,
    toIdx + 1,
    maxIdx,
  );
  if (Number.isInteger(stillLandingIdx) && stillLandingIdx > toIdx) {
    const integrationEndIdx = Math.max(toIdx + 1, stillLandingIdx - 1);
    if (integrationEndIdx > toIdx) {
      return {
        endIdx: integrationEndIdx,
        anchorIdx: stillLandingIdx,
        method: 'zupt-still',
        source: 'csav-to-zupt-still',
      };
    }
  }

  return null;
}

function resolvePostLandingStance(stanceWindows, anchorIdx, sampleCount) {
  const matched = findStanceWindowAroundIndex(stanceWindows, anchorIdx, 'after');
  if (matched) {
    return matched;
  }

  return {
    startIdx: anchorIdx,
    endIdx: Math.min(sampleCount - 1, anchorIdx + POST_IC_STANCE_SAMPLES),
  };
}

/**
 * Build TO→landing swing integration with CSAV / ZUPT stance anchors.
 */
export function buildCsavSwingIntegration(
  cycle,
  stanceWindows,
  timestamps,
  sampleCount,
  events = [],
  smoothedAngVel = [],
) {
  const icIdx = phaseIndex(cycle.ic) ?? phaseIndex(cycle.hsStart);
  const nextIcIdx = phaseIndex(cycle.hsEnd);
  const toIdx = resolveCycleToIndex(cycle, events);

  if (!Number.isInteger(icIdx) || !Number.isInteger(toIdx) || toIdx <= icIdx) {
    return null;
  }

  const searchMaxIdx = Number.isInteger(nextIcIdx) && nextIcIdx > toIdx
    ? nextIcIdx
    : Math.min(sampleCount - 1, toIdx + Math.round(MAX_STRIDE_SECONDS * SAMPLE_RATE));

  const swingEnd = resolveSwingEndIndex({
    toIdx,
    nextIcIdx: Number.isInteger(nextIcIdx) && nextIcIdx > toIdx ? nextIcIdx : null,
    smoothedAngVel,
    timestamps,
    stanceWindows,
    sampleCount,
    searchMaxIdx,
  });

  if (!swingEnd) {
    return null;
  }

  const integrationStartIdx = toIdx;
  const integrationEndIdx = swingEnd.endIdx;

  if (
    integrationStartIdx >= integrationEndIdx
    || (integrationEndIdx - integrationStartIdx + 1) < MIN_SWING_INTEGRATION_SAMPLES
  ) {
    return null;
  }

  const preSwingStanceEndIdx = Math.max(icIdx, toIdx - 1);
  const preSwingStance = resolveStanceAnchorInRange(stanceWindows, icIdx, preSwingStanceEndIdx);
  const postSwingStance = resolvePostLandingStance(stanceWindows, swingEnd.anchorIdx, sampleCount);

  const segmentStartIdx = Math.min(
    preSwingStance.startIdx,
    integrationStartIdx,
    postSwingStance.startIdx,
  );
  const segmentEndIdx = Math.max(
    preSwingStance.endIdx,
    integrationEndIdx,
    postSwingStance.endIdx,
  );

  return {
    integrationWindow: buildIntegrationWindow(
      integrationStartIdx,
      integrationEndIdx,
      timestamps,
      swingEnd.source,
      true,
    ),
    segmentStartIdx,
    segmentEndIdx,
    stanceWindowsLocal: [
      {
        startIdx: preSwingStance.startIdx - segmentStartIdx,
        endIdx: preSwingStance.endIdx - segmentStartIdx,
      },
      {
        startIdx: postSwingStance.startIdx - segmentStartIdx,
        endIdx: postSwingStance.endIdx - segmentStartIdx,
      },
    ],
    csavPhases: {
      icIdx,
      toIdx,
      nextIcIdx: Number.isInteger(nextIcIdx) ? nextIcIdx : swingEnd.anchorIdx,
      swingEndMethod: swingEnd.method,
    },
  };
}

export function isCsavSwingIntegration(integrationBundle) {
  const source = integrationBundle?.integrationWindow?.source;
  return CSAV_SWING_INTEGRATION_SOURCES.has(source);
}

export function isCsavToIcIntegration(integrationBundle) {
  return isCsavSwingIntegration(integrationBundle);
}

export function getSwingEndChartLabel(integrationWindow) {
  if (!integrationWindow || !CSAV_SWING_INTEGRATION_SOURCES.has(integrationWindow.source)) {
    return 'Integration End';
  }

  if (integrationWindow.swingEndMethod === 'zupt' || integrationWindow.source?.includes('zupt')) {
    return 'Swing End (ZUPT)';
  }

  return 'Swing End (IC)';
}

export function selectChartIntegrationWindow(integrationWindows = [], chartStartIdx = 0) {
  if (!integrationWindows.length) {
    return null;
  }

  const isPreferred = (window) => CSAV_SWING_INTEGRATION_SOURCES.has(window?.source);

  for (let i = integrationWindows.length - 1; i >= 0; i -= 1) {
    const window = integrationWindows[i];
    if (isPreferred(window) && window.startIdx >= chartStartIdx) {
      return window;
    }
  }

  for (let i = integrationWindows.length - 1; i >= 0; i -= 1) {
    if (isPreferred(integrationWindows[i])) {
      return integrationWindows[i];
    }
  }

  for (let i = integrationWindows.length - 1; i >= 0; i -= 1) {
    const window = integrationWindows[i];
    if (window?.startIdx >= chartStartIdx) {
      return window;
    }
  }

  return integrationWindows[integrationWindows.length - 1] ?? null;
}
