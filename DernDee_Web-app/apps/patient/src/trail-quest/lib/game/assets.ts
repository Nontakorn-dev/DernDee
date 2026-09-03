import { getCharacter, type CharacterId } from "@trail/lib/game/characters";
import {
  bumpSpriteMediaEpoch,
  loadSpriteClip,
  loadSpriteClipOptional,
  type SpriteClip,
} from "@trail/lib/game/sprites";

export const SCENE_SRC_W = 1792;
export const SCENE_SRC_H = 1008;
/** Walkable surface. Lower = feet lower on screen. */
export const SCENE_GRASS_FRAC = 0.70;
export const DINO_FEET_IN_CLIP = 0.82;
export const FLAG_DRAW_FRAC = 0.36;
export const FLAG_BASE_IN_CLIP = 0.87;
export const FLAG_POLE_X = 0.36;
export const SCENE_HOLE_START = 806;
export const SCENE_HOLE_END = 992;
export const SCENE_COUNT = 10;
/** First five tiles live in one strip so joins can be blended. */
export const STRIP_TILES = 5;
/** 5 encounters + 2 finish tiles — enough for a stage, cheaper than all 10. */
export const SEASON_TILES = 7;

export type SceneSeason = "summer" | "autumn" | "snow";

export function sceneSeasonForStage(stageId: number): SceneSeason {
  if (stageId >= 3) return "snow";
  if (stageId === 2) return "autumn";
  return "summer";
}

export type CharacterClips = {
  characterId: CharacterId;
  idle: SpriteClip;
  walk: SpriteClip;
  jump: SpriteClip | null;
  duck: SpriteClip | null;
  tired: SpriteClip | null;
};

export type WorldAssets = {
  scenes: HTMLImageElement[];
  scenesDuck: HTMLImageElement[];
  jumpStrip: HTMLImageElement | null;
  duckStrip: HTMLImageElement | null;
  bird: SpriteClip | null;
  flag: SpriteClip | null;
};

export type GameAssets = WorldAssets & CharacterClips;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load ${src}`));
    img.src = src;
  });
}

async function loadImageOptional(src: string) {
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

async function loadFirstImage(srcs: string[]) {
  for (const src of srcs) {
    const img = await loadImageOptional(src);
    if (img) return img;
  }
  return null;
}

function usableStrip(img: HTMLImageElement | null) {
  if (!img?.naturalWidth) return null;
  if (img.naturalWidth < SCENE_SRC_W * STRIP_TILES) return null;
  return img;
}

export type SceneBlit = {
  img: HTMLImageElement;
  srcX: number;
};

export function sceneCapacity(assets: WorldAssets) {
  const jumpN = (assets.jumpStrip ? STRIP_TILES : 0) + assets.scenes.length;
  const duckN = (assets.duckStrip ? STRIP_TILES : 0) + assets.scenesDuck.length;
  return Math.max(jumpN, duckN);
}

export function sceneTile(
  assets: WorldAssets,
  kind: "jump" | "duck",
  index: number,
): SceneBlit | null {
  const strip = kind === "duck" ? assets.duckStrip : assets.jumpStrip;
  const extras = kind === "duck" ? assets.scenesDuck : assets.scenes;
  const other = kind === "duck" ? assets.scenes : assets.scenesDuck;
  if (strip && index < STRIP_TILES) {
    return { img: strip, srcX: index * SCENE_SRC_W };
  }
  const extraIndex = strip ? index - STRIP_TILES : index;
  const tile = extras[extraIndex] ?? other[extraIndex];
  if (!tile) return null;
  return { img: tile, srcX: 0 };
}

let sharedPromise: Promise<{ bird: SpriteClip; flag: SpriteClip }> | null = null;
const seasonCache = new Map<
  string,
  Promise<{
    scenes: HTMLImageElement[];
    scenesDuck: HTMLImageElement[];
    jumpStrip: HTMLImageElement | null;
    duckStrip: HTMLImageElement | null;
  }>
>();

function seasonUrls(season: SceneSeason) {
  if (season === "autumn") {
    return {
      jumpStrip: ["/game/scenes/autumn/hip/sence-strip.jpg"],
      duckStrip: ["/game/scenes/autumn/dorsi/sence-strip.jpg"],
      jump: (i: number) => `/game/scenes/autumn/hip/sence${i}.jpg`,
      duck: (i: number) => `/game/scenes/autumn/dorsi/sence${i}.jpg`,
    };
  }
  if (season === "snow") {
    return {
      jumpStrip: ["/game/scenes/snow/hip/sence-strip.jpg"],
      duckStrip: ["/game/scenes/snow/dorsi/sence-strip.jpg"],
      jump: (i: number) => `/game/scenes/snow/hip/sence${i}.jpg`,
      duck: (i: number) => `/game/scenes/snow/dorsi/sence${i}.jpg`,
    };
  }
  return {
    jumpStrip: ["/game/scenes/sence-strip.jpg", "/game/scenes/sence-strip.png"],
    duckStrip: ["/game/scenes/dorsi/sence-strip.jpg"],
    jump: (i: number) => `/game/scenes/sence${i}.png`,
    duck: (i: number) => `/game/scenes/dorsi/sence${i}.jpg`,
  };
}

function loadSharedWorld() {
  if (!sharedPromise) {
    sharedPromise = Promise.all([loadSpriteClip("bird"), loadSpriteClip("flag")]).then(
      ([bird, flag]) => ({ bird, flag }),
    );
    sharedPromise.catch(() => {
      sharedPromise = null;
    });
  }
  return sharedPromise;
}

function tileRange(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function loadSeasonPlayable(season: SceneSeason, needJump: boolean) {
  const key = `play:${season}:${needJump ? "jump" : "duck"}`;
  const cached = seasonCache.get(key);
  if (cached) return cached;
  const urls = seasonUrls(season);
  const pending = (async () => {
    const primary = needJump
      ? usableStrip(await loadFirstImage(urls.jumpStrip))
      : usableStrip(await loadFirstImage(urls.duckStrip));
    return {
      scenes: [] as HTMLImageElement[],
      scenesDuck: [] as HTMLImageElement[],
      jumpStrip: needJump ? primary : null,
      duckStrip: needJump ? null : primary,
    };
  })();
  pending.catch(() => {
    seasonCache.delete(key);
  });
  seasonCache.set(key, pending);
  return pending;
}

function loadSeasonPack(season: SceneSeason, needJump: boolean) {
  const key = `${season}:${needJump ? "jump" : "duck"}`;
  const cached = seasonCache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const playable = await loadSeasonPlayable(season, needJump);
    return hydrateSeasonExtras(playable, season, needJump);
  })();
  pending.catch(() => {
    seasonCache.delete(key);
  });
  seasonCache.set(key, pending);
  return pending;
}

async function hydrateSeasonExtras(
  pack: {
    scenes: HTMLImageElement[];
    scenesDuck: HTMLImageElement[];
    jumpStrip: HTMLImageElement | null;
    duckStrip: HTMLImageElement | null;
  },
  season: SceneSeason,
  needJump: boolean,
) {
  const urls = seasonUrls(season);
  if (!pack.jumpStrip) {
    pack.jumpStrip = usableStrip(await loadFirstImage(urls.jumpStrip));
  }
  if (!pack.duckStrip) {
    pack.duckStrip = usableStrip(await loadFirstImage(urls.duckStrip));
  }
  const duckFrom = pack.duckStrip ? STRIP_TILES + 1 : 1;
  const jumpFrom = pack.jumpStrip ? STRIP_TILES + 1 : 1;
  if (pack.scenesDuck.length === 0) {
    pack.scenesDuck = await Promise.all(tileRange(duckFrom, SEASON_TILES).map((i) => loadImage(urls.duck(i))));
  }
  if (needJump && pack.scenes.length === 0) {
    pack.scenes = await Promise.all(tileRange(jumpFrom, SEASON_TILES).map((i) => loadImage(urls.jump(i))));
  } else if (!needJump && pack.scenes.length === 0) {
    pack.scenes = pack.scenesDuck;
  }
  return pack;
}

export async function loadWorldAssets(
  season: SceneSeason = "summer",
  needJump = true,
): Promise<WorldAssets> {
  const [shared, pack] = await Promise.all([loadSharedWorld(), loadSeasonPack(season, needJump)]);
  return { ...shared, ...pack };
}

export function preloadWorldAssets(season: SceneSeason, needJump = true) {
  void loadWorldAssets(season, needJump);
}

async function loadCharacterPose(id: CharacterId, pose: "idle" | "walk" | "jump" | "duck" | "tired") {
  return loadSpriteClip(`${id}.${pose}`);
}

export async function loadCharacterClips(characterId: CharacterId): Promise<CharacterClips> {
  const spec = getCharacter(characterId);
  const [idle, walk, jump, duck, tired] = await Promise.all([
    loadCharacterPose(spec.id, "idle"),
    loadCharacterPose(spec.id, "walk"),
    loadSpriteClipOptional(`${spec.id}.jump`),
    loadSpriteClipOptional(`${spec.id}.duck`),
    loadSpriteClipOptional(`${spec.id}.tired`),
  ]);
  return { characterId: spec.id, idle, walk, jump, duck, tired };
}

/** Walk + the clip this chapter needs first, plus season art. */
export async function loadPlayableAssets(
  characterId: CharacterId,
  season: SceneSeason = "summer",
  needJump = true,
  energyRun = false,
): Promise<GameAssets> {
  const spec = getCharacter(characterId);
  const actionKey = energyRun ? "tired" : needJump ? "jump" : "duck";
  const birdJob = !energyRun && !needJump ? loadSpriteClip("bird") : Promise.resolve(null);
  const [idle, walk, actionClip, birdClip, pack] = await Promise.all([
    loadCharacterPose(spec.id, "idle"),
    loadCharacterPose(spec.id, "walk"),
    loadSpriteClipOptional(`${spec.id}.${actionKey}`),
    birdJob,
    loadSeasonPlayable(season, needJump),
  ]);
  return {
    characterId: spec.id,
    idle,
    walk,
    jump: needJump ? actionClip : null,
    duck: !needJump && !energyRun ? actionClip : null,
    tired: energyRun ? actionClip : null,
    bird: birdClip,
    flag: null,
    ...pack,
  };
}

/** Fill jump/duck/bird/flag and the rest of the season on the live assets object. */
export async function hydrateGameAssets(
  assets: GameAssets,
  season: SceneSeason = "summer",
  needJump = true,
) {
  const id = assets.characterId;
  const jobs: Promise<void>[] = [];
  if (!assets.jump) {
    jobs.push(
      loadSpriteClipOptional(`${id}.jump`).then((clip) => {
        if (clip) assets.jump = clip;
      }),
    );
  }
  if (!assets.duck) {
    jobs.push(
      loadSpriteClipOptional(`${id}.duck`).then((clip) => {
        if (clip) assets.duck = clip;
      }),
    );
  }
  if (!assets.tired) {
    jobs.push(
      loadSpriteClipOptional(`${id}.tired`).then((clip) => {
        if (clip) assets.tired = clip;
      }),
    );
  }
  if (!assets.bird || !assets.flag) {
    jobs.push(
      loadSharedWorld().then(({ bird, flag }) => {
        assets.bird = bird;
        assets.flag = flag;
      }),
    );
  }
  jobs.push(
    hydrateSeasonExtras(assets, season, needJump).then(() => {
      /* pack fields live on assets */
    }),
  );
  await Promise.all(jobs);
}

export async function loadGameAssets(
  characterId: CharacterId,
  season: SceneSeason = "summer",
  needJump = true,
): Promise<GameAssets> {
  const assets = await loadPlayableAssets(characterId, season, needJump);
  await hydrateGameAssets(assets, season, needJump);
  return assets;
}

/** Drop decoded scenes/atlases so Free Walk and the rest of the app can breathe. */
export function releaseGameMedia() {
  bumpSpriteMediaEpoch();
  sharedPromise = null;
  seasonCache.clear();
}
