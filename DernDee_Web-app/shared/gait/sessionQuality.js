/**
 * Session-level spatial quality scoring (PRD Phase 3).
 */

const INTEGRATION_SOURCE_SCORES = {
  'csav-to-ic': 1.0,
  'to-ic-heuristic': 0.88,
  'csav-to-zupt-stance': 0.82,
  'to-zupt-stance': 0.8,
  'csav-to-zupt-still': 0.76,
  'to-zupt-still': 0.74,
  'stance-to-stance': 0.72,
  'post-peak-valley': 0.55,
  'sustained-quiet-start': 0.5,
  'adaptive-stance-entry': 0.48,
  'zero-crossing-fallback': 0.42,
  'min-abs-fallback': 0.38,
  'hs-end-fallback': 0.3,
  fallback: 0.25,
};

function integrationSourceScore(source) {
  return INTEGRATION_SOURCE_SCORES[source] ?? 0.35;
}

export function computeSessionQuality(cycles = [], integrationWindows = [], cycleConfidence = null) {
  if (!cycles.length) {
    return {
      score: 0,
      grade: 'insufficient',
      flags: ['no-cycles'],
      resolvedToRate: 0,
      csavIntegrationRate: 0,
      averageCycleConfidence: null,
      dominantIntegrationSource: null,
    };
  }

  const resolvedToCount = cycles.filter((cycle) => cycle.to?.resolved).length;
  const csavSwingSources = new Set([
    'csav-to-ic',
    'csav-to-zupt-stance',
    'csav-to-zupt-still',
    'to-ic-heuristic',
    'to-zupt-stance',
    'to-zupt-still',
  ]);
  const csavIntegrationCount = integrationWindows.filter((window) => csavSwingSources.has(window?.source)).length;
  const resolvedToRate = resolvedToCount / cycles.length;
  const csavIntegrationRate = csavIntegrationCount / cycles.length;

  const integrationScores = integrationWindows.map((window) => integrationSourceScore(window?.source));
  const averageIntegrationScore = integrationScores.length
    ? integrationScores.reduce((sum, value) => sum + value, 0) / integrationScores.length
    : 0;

  const confidences = cycles
    .flatMap((cycle) => Object.values(cycle.phaseConfidences || {}).filter(Number.isFinite));
  const averageCycleConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : (Number.isFinite(cycleConfidence) ? cycleConfidence : null);

  const confidenceComponent = Number.isFinite(averageCycleConfidence)
    ? averageCycleConfidence
    : resolvedToRate;

  const score = Math.round(
    (
      (confidenceComponent * 0.35)
      + (resolvedToRate * 0.25)
      + (csavIntegrationRate * 0.25)
      + (averageIntegrationScore * 0.15)
    ) * 100,
  );

  const flags = [];
  if (resolvedToRate < 0.5) {
    flags.push('low-to-resolution');
  }
  if (csavIntegrationRate < 0.5) {
    flags.push('legacy-integration-fallback');
  }
  if (Number.isFinite(averageCycleConfidence) && averageCycleConfidence < 0.55) {
    flags.push('low-phase-confidence');
  }
  if (score < 50) {
    flags.push('low-spatial-quality');
  }

  const sourceCounts = integrationWindows.reduce((counts, window) => {
    const source = window?.source || 'unknown';
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});
  const dominantIntegrationSource = Object.entries(sourceCounts)
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

  let grade = 'good';
  if (score < 50) {
    grade = 'poor';
  } else if (score < 75) {
    grade = 'fair';
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    grade,
    flags,
    resolvedToRate,
    csavIntegrationRate,
    averageCycleConfidence,
    dominantIntegrationSource,
  };
}
