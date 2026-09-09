export function walkwayTrackPosition({
  progressM = 0,
  lengthM = 5,
  direction = 'out',
} = {}) {
  const pathLength = Math.max(0.001, Number(lengthM) || 5);
  const ratio = Math.max(0, Math.min(1, (Number(progressM) || 0) / pathLength));
  const along = direction === 'back' ? 1 - ratio : ratio;

  return {
    along,
    ratio,
    facing: direction === 'back' ? 'start' : 'turn',
    bottomPercent: 3 + along * 56,
    scale: 1.22 - along * 0.28,
  };
}

export function walkwayLapFromLegIndex(legIndex = 0) {
  return (Math.max(0, Number(legIndex) || 0) % 2) + 1;
}
