import { getCharacter, type CharacterId } from "@trail/lib/game/characters";

export const SCENE_SRC_W = 1792;
export const SCENE_SRC_H = 1008;
/** Walkable surface. Lower = feet lower on screen. */
export const SCENE_GRASS_FRAC = 0.70;
export const DINO_FEET_IN_CLIP = 0.8;
export const FLAG_DRAW_FRAC = 0.36;
export const FLAG_BASE_IN_CLIP = 0.87;
export const FLAG_POLE_X = 0.36;
export const FLAG_RATE = 1.55;
export const SCENE_HOLE_START = 806;
export const SCENE_HOLE_END = 992;
export const SCENE_COUNT = 10;
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
  walk: HTMLVideoElement;
  jump: HTMLVideoElement;
  duck: HTMLVideoElement;
  tired: HTMLVideoElement | null;
};

export type WorldAssets = {
  scenes: HTMLImageElement[];
  scenesDuck: HTMLImageElement[];
  bird: HTMLVideoElement;
  flag: HTMLVideoElement;
};

export type GameAssets = WorldAssets & CharacterClips;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const decoded = img.decode?.();
      if (decoded) {
        void decoded.then(() => resolve(img)).catch(() => resolve(img));
        return;
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error(`load ${src}`));
    img.src = src;
  });
}

const videoCache = new Map<string, Promise<HTMLVideoElement>>();

function loadVideo(src: string, loop: boolean) {
  const cached = videoCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = loop;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.crossOrigin = "anonymous";
    video.src = src;
    const onReady = () => {
      video.removeEventListener("canplaythrough", onReady);
      video.removeEventListener("error", onErr);
      video.pause();
      video.currentTime = 0;
      resolve(video);
    };
    const onErr = () => {
      videoCache.delete(src);
      reject(new Error(`load ${src}`));
    };
    video.addEventListener("canplaythrough", onReady);
    video.addEventListener("error", onErr);
    video.load();
  });
  videoCache.set(src, pending);
  return pending;
}

let sharedPromise: Promise<{ bird: HTMLVideoElement; flag: HTMLVideoElement }> | null = null;
const seasonCache = new Map<
  string,
  Promise<{ scenes: HTMLImageElement[]; scenesDuck: HTMLImageElement[] }>
>();

function seasonUrls(season: SceneSeason) {
  if (season === "autumn") {
    return {
      jump: (i: number) => `/game/scenes/autumn/hip/sence${i}.jpg`,
      duck: (i: number) => `/game/scenes/autumn/dorsi/sence${i}.jpg`,
    };
  }
  if (season === "snow") {
    return {
      jump: (i: number) => `/game/scenes/snow/hip/sence${i}.jpg`,
      duck: (i: number) => `/game/scenes/snow/dorsi/sence${i}.jpg`,
    };
  }
  return {
    jump: (i: number) => `/game/scenes/sence${i}.png`,
    duck: (i: number) => `/game/scenes/dorsi/sence${i}.jpg`,
  };
}

function loadSharedWorld() {
  if (!sharedPromise) {
    sharedPromise = Promise.all([
      loadVideo("/game/bird.mp4", true),
      loadVideo("/game/flag.mp4", true),
    ]).then(([bird, flag]) => ({ bird, flag }));
    sharedPromise.catch(() => {
      sharedPromise = null;
    });
  }
  return sharedPromise;
}

function loadSeasonPack(season: SceneSeason, needJump: boolean) {
  const key = `${season}:${needJump ? "jump" : "duck"}`;
  const cached = seasonCache.get(key);
  if (cached) return cached;
  const urls = seasonUrls(season);
  const duck = Promise.all(
    Array.from({ length: SEASON_TILES }, (_, i) => loadImage(urls.duck(i + 1))),
  );
  const jump = needJump
    ? Promise.all(
        Array.from({ length: SEASON_TILES }, (_, i) => loadImage(urls.jump(i + 1))),
      )
    : duck;
  const pending = Promise.all([jump, duck]).then(([scenes, scenesDuck]) => ({
    scenes,
    scenesDuck,
  }));
  pending.catch(() => {
    seasonCache.delete(key);
  });
  seasonCache.set(key, pending);
  return pending;
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

async function loadOptionalVideo(src: string | undefined, loop: boolean) {
  if (!src) return null;
  try {
    return await loadVideo(src, loop);
  } catch {
    return null;
  }
}

export async function loadCharacterClips(characterId: CharacterId): Promise<CharacterClips> {
  const spec = getCharacter(characterId);
  const [walk, jump, duck, tired] = await Promise.all([
    loadVideo(spec.walk, true),
    loadVideo(spec.jump, false),
    loadVideo(spec.duck, false),
    loadOptionalVideo(spec.tired, false),
  ]);
  return { characterId: spec.id, walk, jump, duck, tired };
}

export async function loadGameAssets(
  characterId: CharacterId,
  season: SceneSeason = "summer",
  needJump = true,
): Promise<GameAssets> {
  const [world, clips] = await Promise.all([
    loadWorldAssets(season, needJump),
    loadCharacterClips(characterId),
  ]);
  return { ...world, ...clips };
}

export async function tryPlay(video: HTMLVideoElement) {
  try {
    await video.play();
  } catch {
    /* autoplay may wait for a gesture */
  }
}
