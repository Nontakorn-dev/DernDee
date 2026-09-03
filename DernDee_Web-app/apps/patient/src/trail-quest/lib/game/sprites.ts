export type SpriteClip = {
  image: HTMLImageElement;
  frame: number;
  cols: number;
  rows: number;
  frames: number;
  fps: number;
  loop: boolean;
  pingpong: boolean;
  feetY: number;
};

export type SpriteMetaClip = {
  src: string;
  frames: number;
  cols: number;
  rows: number;
  frame: number;
  fps: number;
  loop: boolean;
  pingpong?: boolean;
  feetY: number;
};

type SpriteMetaFile = {
  frameSize: number;
  clips: Record<string, SpriteMetaClip>;
};

const imageCache = new Map<string, Promise<HTMLImageElement>>();
let metaPromise: Promise<SpriteMetaFile> | null = null;
let mediaEpoch = 0;

export function spriteMediaEpoch() {
  return mediaEpoch;
}

export function bumpSpriteMediaEpoch() {
  mediaEpoch += 1;
  imageCache.clear();
  metaPromise = null;
}

function loadImage(src: string) {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const epoch = mediaEpoch;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (epoch !== mediaEpoch) {
        reject(new Error("released"));
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      imageCache.delete(src);
      reject(new Error(`load ${src}`));
    };
    img.src = src;
  });
  imageCache.set(src, pending);
  return pending;
}

export function loadSpriteMeta() {
  if (!metaPromise) {
    metaPromise = fetch("/game/sprites/meta.json?v=6")
      .then((res) => {
        if (!res.ok) throw new Error("sprite meta");
        return res.json() as Promise<SpriteMetaFile>;
      })
      .catch((error) => {
        metaPromise = null;
        throw error;
      });
  }
  return metaPromise;
}

export async function loadSpriteClip(key: string): Promise<SpriteClip> {
  const meta = await loadSpriteMeta();
  const entry = meta.clips[key];
  if (!entry) throw new Error(`missing sprite ${key}`);
  const epoch = mediaEpoch;
  const image = await loadImage(entry.src);
  if (epoch !== mediaEpoch) throw new Error("released");
  return {
    image,
    frame: entry.frame,
    cols: entry.cols,
    rows: entry.rows,
    frames: entry.frames,
    fps: entry.fps,
    loop: entry.loop,
    pingpong: Boolean(entry.pingpong),
    feetY: entry.feetY,
  };
}

export async function loadSpriteClipOptional(key: string) {
  try {
    return await loadSpriteClip(key);
  } catch {
    return null;
  }
}

export function spriteSource(clip: SpriteClip, index: number) {
  const n = Math.max(1, clip.frames);
  let i = index;
  if (!clip.loop) {
    i = Math.max(0, Math.min(n - 1, index));
  } else if (clip.pingpong && n > 1) {
    const cycle = (n - 1) * 2;
    const t = ((index % cycle) + cycle) % cycle;
    i = t < n ? t : cycle - t;
  } else {
    i = ((index % n) + n) % n;
  }
  const col = i % clip.cols;
  const row = Math.floor(i / clip.cols);
  return {
    sx: col * clip.frame,
    sy: row * clip.frame,
    sw: clip.frame,
    sh: clip.frame,
  };
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  clip: SpriteClip,
  index: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  if (!clip.image.naturalWidth) return;
  const s = spriteSource(clip, index);
  ctx.drawImage(clip.image, s.sx, s.sy, s.sw, s.sh, dx, dy, dw, dh);
}

export function loopFrame(clip: SpriteClip, timeSec: number, rate = 1) {
  return Math.floor(Math.max(0, timeSec) * clip.fps * rate);
}

export function oneshotFrame(clip: SpriteClip, progress01: number) {
  const n = Math.max(1, clip.frames);
  const u = Math.max(0, Math.min(1, progress01));
  return Math.min(n - 1, Math.floor(u * n));
}
