export const WALKWAY_STONE_COUNT = 10;

export function walkwayStoneWindow({
  progressM = 0,
  lengthM = 5,
  slotCount = 4,
  stoneCount = WALKWAY_STONE_COUNT,
} = {}) {
  const pathLength = Math.max(0.001, Number(lengthM) || 5);
  const clamped = Math.max(0, Math.min(pathLength, Number(progressM) || 0));
  const current = 1 + Math.min(
    stoneCount - 1,
    Math.floor((clamped / pathLength) * stoneCount),
  );
  const maxVisibleStart = Math.max(1, stoneCount - slotCount + 1);
  const visibleStart = Math.min(current, maxVisibleStart);
  const numbers = [];
  for (let index = 0; index < slotCount; index += 1) {
    const stoneNumber = visibleStart + index;
    if (stoneNumber <= stoneCount) {
      numbers.push(stoneNumber);
    }
  }

  return {
    current,
    visibleStart,
    numbers,
  };
}
