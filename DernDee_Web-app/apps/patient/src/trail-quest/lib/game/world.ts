import {
  SCENE_COUNT,
  SCENE_HOLE_END,
  SCENE_HOLE_START,
  SCENE_SRC_W,
} from "@trail/lib/game/assets";
import type { Encounter, HazardKind, Platform } from "@trail/lib/game/types";
import { isEnergyRun, type MovementKind } from "@trail/lib/progression";

export const WALK_SPEED = 210;
export const RUN_SPEED = 290;
export const GAP_WIDTH = SCENE_HOLE_END - SCENE_HOLE_START;
export const STAND_BACK = 92;
export const LAND_INSET = 70;
export const JUMP_DURATION = 1.15;
export const JUMP_HEIGHT = 210;
export const DUCK_DURATION = 1.85;
export const DUCK_SHUFFLE = 42;
export const BIRD_SPEED = 544;
export const IDLE_ANGLE = 6;
export const CHARGE_RATE = 14;
export const DECAY_RATE = 16;
export const POINTS_PER_JUMP = 120;
export const HOLD_BONUS_MAX = 80;
export const FINISH_TILES = 2;
export const FLAG_IN_FINISH = 0.38;

export function hazardKindFor(chapter: MovementKind, index: number): HazardKind {
  if (chapter === "dorsiflexor" || isEnergyRun(chapter)) return "duck";
  if (chapter === "hip-flexor") return "jump";
  return index % 2 === 0 ? "duck" : "jump";
}

export function hazardLabelFor(chapter: MovementKind, kind: HazardKind | null) {
  if (isEnergyRun(chapter)) return "พลัง";
  if (chapter === "dorsiflexor") return "นก";
  if (chapter === "hip-flexor") return "เหว";
  if (kind === "duck") return "นก";
  if (kind === "jump") return "เหว";
  return "อุปสรรค";
}

export function buildWorld(chapter: MovementKind, gaps: number, freeWalk = false) {
  const count = Math.min(SCENE_COUNT, Math.max(1, gaps));
  if (freeWalk) {
    return {
      platforms: [{ x: 0, width: (SCENE_COUNT + 12) * SCENE_SRC_W }],
      encounters: [],
    };
  }
  if (isEnergyRun(chapter)) {
    return {
      platforms: [{ x: 0, width: (count + FINISH_TILES) * SCENE_SRC_W }],
      encounters: [],
    };
  }
  const encounters: Encounter[] = [];
  const platforms: Platform[] = [];
  let platStart = 0;

  const closePlatform = (endX: number) => {
    if (endX - platStart > 8) {
      platforms.push({ x: platStart, width: endX - platStart });
    }
  };

  for (let i = 0; i < count; i += 1) {
    const base = i * SCENE_SRC_W;
    const holeStart = base + SCENE_HOLE_START;
    const holeEnd = base + SCENE_HOLE_END;
    const waitX = holeStart - STAND_BACK;
    const kind = hazardKindFor(chapter, i);
    const hazardX = (holeStart + holeEnd) / 2;
    if (kind === "jump") {
      closePlatform(holeStart);
      platStart = holeEnd;
      encounters.push({
        kind,
        waitX,
        hazardX,
        jumpToX: holeEnd + LAND_INSET,
        sceneIndex: i,
      });
    } else {
      encounters.push({
        kind,
        waitX,
        hazardX,
        jumpToX: waitX,
        sceneIndex: i,
      });
    }
  }

  closePlatform((count + FINISH_TILES) * SCENE_SRC_W);
  return { platforms, encounters };
}

export function worldEnd(platforms: Platform[]) {
  const last = platforms[platforms.length - 1];
  if (!last) return 0;
  return last.x + last.width - SCENE_SRC_W * (FINISH_TILES - FLAG_IN_FINISH);
}

export function platformAt(platforms: Platform[], x: number) {
  return platforms.find((p) => x >= p.x && x <= p.x + p.width) ?? null;
}
