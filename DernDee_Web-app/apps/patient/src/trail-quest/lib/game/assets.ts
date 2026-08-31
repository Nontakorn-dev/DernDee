import { getCharacter, type CharacterId } from "@trail/lib/game/characters";
import { isConstrainedWebKit } from "@trail/lib/game/runtime";

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
  walk: HTMLVideoElement;
  jump: HTMLVideoElement | null;
  duck: HTMLVideoElement | null;
  tired: HTMLVideoElement | null;
};

export type WorldAssets = {
  scenes: HTMLImageElement[];
  scenesDuck: HTMLImageElement[];
  jumpStrip: HTMLImageElement | null;
  duckStrip: HTMLImageElement | null;
  bird: HTMLVideoElement | null;
  flag: HTMLVideoElement | null;
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

const videoCache = new Map<string, Promise<HTMLVideoElement>>();
const CLIP_DECODE_PX = 288;
const CLIP_HOST_ID = "trail-clip-host";
let mediaEpoch = 0;

function clipHost(root?: HTMLElement | null) {
  let host = document.getElementById(CLIP_HOST_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = CLIP_HOST_ID;
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:absolute;left:0;top:0;width:8px;height:8px;overflow:hidden;pointer-events:none;z-index:0;opacity:0.01";
  }
  const parent = root ?? document.body;
  if (host.parentElement !== parent) parent.appendChild(host);
  return host;
}

function mountClip(video: HTMLVideoElement, packed = false, root?: HTMLElement | null) {
  const w = packed ? CLIP_DECODE_PX * 2 : CLIP_DECODE_PX;
  const h = CLIP_DECODE_PX;
  video.width = w;
  video.height = h;
  video.style.cssText = `width:${w}px;height:${h}px;display:block;position:absolute;left:0;top:0`;
  const host = clipHost(root);
  if (video.parentElement !== host) host.appendChild(video);
}

function isPackedSrc(src: string) {
  return /\.ios\.mp4(?:$|\?)/i.test(src);
}

function packedSrc(src: string) {
  return src.replace(/\.mp4$/i, ".ios.mp4");
}

function loadVideo(src: string, loop: boolean) {
  const cached = videoCache.get(src);
  if (cached) return cached;
  const packed = isPackedSrc(src);
  const epoch = mediaEpoch;
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
    mountClip(video, packed);
    if (epoch !== mediaEpoch) {
      disposeVideo(video);
      reject(new Error("released"));
      return;
    }
    video.src = src;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onErr);
      if (epoch !== mediaEpoch) {
        disposeVideo(video);
        videoCache.delete(src);
        reject(new Error("released"));
        return;
      }
      if (ok) resolve(video);
      else {
        videoCache.delete(src);
        reject(new Error(`load ${src}`));
      }
    };
    const onReady = () => finish(true);
    const onErr = () => finish(false);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onErr);
    video.load();
  });
  videoCache.set(src, pending);
  return pending;
}

async function loadGameClip(src: string, loop: boolean) {
  if (isConstrainedWebKit()) {
    try {
      return await loadVideo(packedSrc(src), loop);
    } catch {
      return loadVideo(src, loop);
    }
  }
  return loadVideo(src, loop);
}

/** Keep clips in the visible game tree so WebKit/Bluefy actually decode frames. */
export function attachGameClips(root?: HTMLElement | null) {
  const host = clipHost(root);
  for (const pending of videoCache.values()) {
    void pending.then((video) => {
      if (video.parentElement !== host) host.appendChild(video);
    });
  }
}

let sharedPromise: Promise<{ bird: HTMLVideoElement; flag: HTMLVideoElement }> | null = null;
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
    sharedPromise = Promise.all([
      loadGameClip("/game/bird.mp4", true),
      loadGameClip("/game/flag.mp4", true),
    ]).then(([bird, flag]) => ({ bird, flag }));
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

async function loadOptionalVideo(src: string | undefined, loop: boolean) {
  if (!src) return null;
  try {
    return await loadGameClip(src, loop);
  } catch {
    return null;
  }
}

export async function loadCharacterClips(characterId: CharacterId): Promise<CharacterClips> {
  const spec = getCharacter(characterId);
  const [walk, jump, duck, tired] = await Promise.all([
    loadGameClip(spec.walk, true),
    loadGameClip(spec.jump, false),
    loadGameClip(spec.duck, false),
    loadOptionalVideo(spec.tired, false),
  ]);
  return { characterId: spec.id, walk, jump, duck, tired };
}

/** Walk + season art only — enough to start moving on iPad. */
export async function loadPlayableAssets(
  characterId: CharacterId,
  season: SceneSeason = "summer",
  needJump = true,
): Promise<GameAssets> {
  const spec = getCharacter(characterId);
  const [walk, pack] = await Promise.all([
    loadGameClip(spec.walk, true),
    loadSeasonPlayable(season, needJump),
  ]);
  return {
    characterId: spec.id,
    walk,
    jump: null,
    duck: null,
    tired: null,
    bird: null,
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
  const spec = getCharacter(assets.characterId);
  const epoch = mediaEpoch;
  const jobs: Promise<void>[] = [];
  if (!assets.jump) {
    jobs.push(
      loadGameClip(spec.jump, false).then((video) => {
        if (epoch === mediaEpoch) assets.jump = video;
      }),
    );
  }
  if (!assets.duck) {
    jobs.push(
      loadGameClip(spec.duck, false).then((video) => {
        if (epoch === mediaEpoch) assets.duck = video;
      }),
    );
  }
  if (!assets.tired && spec.tired) {
    jobs.push(
      loadOptionalVideo(spec.tired, false).then((video) => {
        if (epoch === mediaEpoch) assets.tired = video;
      }),
    );
  }
  if (!assets.bird || !assets.flag) {
    jobs.push(
      loadSharedWorld().then(({ bird, flag }) => {
        if (epoch !== mediaEpoch) return;
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

export async function tryPlay(video: HTMLVideoElement) {
  try {
    await video.play();
  } catch {
    /* autoplay may wait for a gesture */
  }
}

function disposeVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.src = "";
  video.load();
  video.remove();
}

/** Drop decoded clips/scenes so Free Walk and the rest of the app can breathe. */
export function releaseGameMedia() {
  mediaEpoch += 1;
  for (const pending of videoCache.values()) {
    void pending.then(disposeVideo).catch(() => {});
  }
  videoCache.clear();
  sharedPromise = null;
  seasonCache.clear();
  document.getElementById(CLIP_HOST_ID)?.remove();
}
