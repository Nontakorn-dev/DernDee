import type { GameAssets } from "@trail/lib/game/assets";
import type { GameSfx } from "@trail/lib/game/sfx";
import type { MovementKind } from "@trail/lib/progression";

export type GamePhase =
  | "walking"
  | "waiting"
  | "tired"
  | "charging"
  | "jumping"
  | "ducking"
  | "running"
  | "clear";

export type HazardKind = "jump" | "duck" | "boost";

export type Platform = {
  x: number;
  width: number;
};

export type Encounter = {
  kind: HazardKind;
  waitX: number;
  hazardX: number;
  jumpToX: number;
  sceneIndex: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};

export type EngineConfig = {
  chapter: MovementKind;
  stage: number;
  gaps: number;
  targetAngle: number;
  runSeconds: number;
  startScore: number;
  kit?: "ankle" | "full";
  freeWalk?: boolean;
  assets?: GameAssets;
  sfx?: GameSfx;
};

export type HudSnapshot = {
  elapsed: number;
  score: number;
  stage: number;
  chapter: MovementKind;
  progress: number;
  angle: number;
  targetAngle: number;
  phase: GamePhase;
  holding: boolean;
  runRemaining: number;
  paused: boolean;
  jumpsDone: number;
  jumpsTotal: number;
  cleared: boolean;
  hazardKind: HazardKind | null;
  hazardLabel: string;
};
