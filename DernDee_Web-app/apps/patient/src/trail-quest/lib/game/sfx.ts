import { getGameAudioContext, unlockGameAudio } from "@shared/audio/unlockGameAudio.js";
import { attachGameAudioElement } from "@shared/audio/playGameHtmlSfx.js";
import type { GamePhase, HazardKind } from "@trail/lib/game/types";

const HTML_SILENT = 0.00001;

const SFX_URLS = {
  walk: "/game/sfx/walk.wav",
  tired: "/game/sfx/tired.wav",
  cliff: "/game/sfx/cliff.wav",
  jump: "/game/sfx/jump.wav",
  success: "/game/sfx/success.wav",
  bird: "/game/sfx/bird.wav",
  duck: "/game/sfx/duck.wav",
} as const;

type SfxName = keyof typeof SFX_URLS;

const LOOP_NAMES = ["walk", "tired"] as const;
type LoopName = (typeof LOOP_NAMES)[number];

let sharedCtx: AudioContext | null = null;
let primed = false;
let htmlArmed = false;
let globalUnlockBound = false;
let ctxWatchBound = false;
const htmlNodes = new Map<SfxName, HTMLAudioElement>();
const shotTimers = new Map<SfxName, number>();
const sfxListeners = new Set<() => void>();

function prefersHtml() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS || /Bluefy/i.test(ua);
}

function audioCtx() {
  if (!primed && !sharedCtx) return null;
  sharedCtx = getGameAudioContext(sharedCtx);
  return sharedCtx;
}

function isLoopName(name: SfxName): name is LoopName {
  return (LOOP_NAMES as readonly string[]).includes(name);
}

function htmlNode(name: SfxName) {
  let el = htmlNodes.get(name);
  if (!el) {
    el = new Audio(SFX_URLS[name]);
    el.preload = "auto";
    el.loop = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.volume = HTML_SILENT;
    htmlNodes.set(name, el);
  }
  attachGameAudioElement(el);
  return el;
}

function armHtmlNode(el: HTMLAudioElement) {
  el.loop = true;
  el.muted = false;
  el.volume = HTML_SILENT;
  const playPromise = el.play();
  if (playPromise?.catch) playPromise.catch(() => {});
}

function armHtmlPool() {
  if (typeof Audio === "undefined" || htmlArmed || !prefersHtml()) return;
  htmlArmed = true;
  armHtmlNode(htmlNode("walk"));
  armHtmlNode(htmlNode("tired"));
}

function notifySfx() {
  for (const fn of sfxListeners) fn();
}

function watchContext(ctx: AudioContext | null) {
  if (!ctx || ctxWatchBound) return;
  ctxWatchBound = true;
  const onState = () => {
    if (ctx.state === "running") notifySfx();
  };
  ctx.addEventListener("statechange", onState);
}

function resumeContext(ctx: AudioContext | null) {
  if (!ctx) return;
  watchContext(ctx);
  if (ctx.state === "running") return;
  const result = ctx.resume();
  if (result?.then) {
    result.then(() => notifySfx()).catch(() => {});
  }
}

function bindGlobalUnlock() {
  if (typeof window === "undefined" || globalUnlockBound) return;
  globalUnlockBound = true;
  if (prefersHtml() && typeof Audio !== "undefined") {
    htmlNode("walk");
    htmlNode("tired");
  }
  const arm = () => primeGameAudio();
  const resume = () => {
    if (!primed) return;
    sharedCtx = unlockGameAudio(sharedCtx);
    resumeContext(sharedCtx);
    notifySfx();
  };
  window.addEventListener("pointerdown", arm, { capture: true });
  window.addEventListener("touchstart", arm, { capture: true, passive: true });
  window.addEventListener("keydown", arm, { capture: true });
  window.addEventListener("pageshow", resume);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
}

/** Call from a tap so Web Audio / iOS autoplay is armed. */
export function primeGameAudio() {
  if (typeof window === "undefined") return;
  bindGlobalUnlock();
  const first = !primed;
  primed = true;
  sharedCtx = unlockGameAudio(sharedCtx);
  resumeContext(sharedCtx);
  if (first && prefersHtml()) armHtmlPool();
  notifySfx();
}

export function isGameAudioPrimed() {
  return primed;
}

export function createGameSfx(opts?: { energyRun?: boolean }) {
  bindGlobalUnlock();
  const useHtml = prefersHtml();
  const buffers = new Map<SfxName, AudioBuffer>();
  const volumes: Record<SfxName, number> = {
    walk: 0.12,
    tired: 0.11,
    cliff: 0.5,
    jump: 0.48,
    success: 0.52,
    bird: 0.32,
    duck: 0.42,
  };

  let muted = false;
  let unlocked = primed;
  let paused = false;
  let phase: GamePhase = "walking";
  let pending: SfxName | null = null;
  let walkSrc: AudioBufferSourceNode | null = null;
  let tiredSrc: AudioBufferSourceNode | null = null;
  let master: GainNode | null = null;
  let decodedCtx: AudioContext | null = null;
  let dead = false;

  const canPlay = () => !dead && unlocked && !muted && !paused;

  const decodeAll = async () => {
    if (useHtml) return;
    const ctx = audioCtx();
    if (!ctx) return;
    if (ctx.state !== "running" && ctx.resume) {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    if (decodedCtx && decodedCtx !== ctx) buffers.clear();
    decodedCtx = ctx;
    await Promise.all(
      (Object.keys(SFX_URLS) as SfxName[]).map(async (name) => {
        if (buffers.has(name)) return;
        try {
          const res = await fetch(SFX_URLS[name]);
          const raw = await res.arrayBuffer();
          const copy = raw.slice(0);
          const buf = await new Promise<AudioBuffer>((resolve, reject) => {
            let settled = false;
            const ok = (next: AudioBuffer) => {
              if (settled) return;
              settled = true;
              resolve(next);
            };
            const fail = (err: unknown) => {
              if (settled) return;
              settled = true;
              reject(err);
            };
            try {
              const ret = ctx.decodeAudioData(copy, ok, fail);
              if (ret && typeof ret.then === "function") ret.then(ok, fail);
            } catch (err) {
              fail(err);
            }
          });
          buffers.set(name, buf);
        } catch {
          /* Safari can reject decode until the context is running */
        }
      }),
    );
  };

  const ensureMaster = () => {
    const ctx = audioCtx();
    if (!ctx) return null;
    if (!master || master.context !== ctx) {
      master = ctx.createGain();
      master.connect(ctx.destination);
      walkSrc = null;
      tiredSrc = null;
    }
    return ctx;
  };

  const playHtmlShot = (name: SfxName) => {
    const el = htmlNode(name);
    el.loop = isLoopName(name);
    el.muted = false;
    el.volume = volumes[name];
    try {
      el.currentTime = 0;
    } catch {
      /* iOS */
    }
    const playPromise = el.play();
    if (playPromise?.catch) playPromise.catch(() => {});
    const prev = shotTimers.get(name);
    if (prev) window.clearTimeout(prev);
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0.8;
    shotTimers.set(
      name,
      window.setTimeout(() => {
        if (!isLoopName(name)) {
          el.loop = true;
          el.volume = HTML_SILENT;
        }
        syncLoops();
      }, dur * 1000),
    );
  };

  const playOneShot = (name: SfxName) => {
    if (!canPlay()) {
      pending = name;
      return;
    }
    if (useHtml) {
      playHtmlShot(name);
      return;
    }
    const ctx = ensureMaster();
    const buf = buffers.get(name);
    if (!ctx || ctx.state !== "running" || !buf || !master) {
      pending = name;
      return;
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.value = volumes[name];
    src.connect(gain);
    gain.connect(master);
    src.start(0);
  };

  const stopHtmlLoop = (name: LoopName) => {
    const el = htmlNodes.get(name);
    if (!el) return;
    el.volume = HTML_SILENT;
    el.loop = true;
  };

  const stopWebLoop = (which: LoopName) => {
    if (which === "walk") {
      try {
        walkSrc?.stop();
      } catch {
        /* already stopped */
      }
      walkSrc = null;
    } else {
      try {
        tiredSrc?.stop();
      } catch {
        /* already stopped */
      }
      tiredSrc = null;
    }
  };

  const stopLoop = (which: LoopName) => {
    if (useHtml) stopHtmlLoop(which);
    else stopWebLoop(which);
  };

  const startHtmlLoop = (name: LoopName, rate = 1) => {
    const el = htmlNode(name);
    el.loop = true;
    el.muted = false;
    try {
      el.playbackRate = rate;
    } catch {
      /* iOS may reject non-1 rates */
    }
    el.volume = volumes[name];
    if (!el.paused && !el.ended) return;
    const playPromise = el.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  };

  const startWebLoop = (name: LoopName, rate = 1) => {
    const ctx = ensureMaster();
    const buf = buffers.get(name);
    if (!ctx || ctx.state !== "running" || !buf || !master) return;
    const existing = name === "walk" ? walkSrc : tiredSrc;
    if (existing) {
      existing.playbackRate.value = rate;
      return;
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    gain.gain.value = volumes[name];
    src.connect(gain);
    gain.connect(master);
    src.onended = () => {
      if (dead) return;
      if (name === "walk") walkSrc = null;
      else tiredSrc = null;
      syncLoops();
    };
    src.start(0);
    if (name === "walk") walkSrc = src;
    else tiredSrc = src;
  };

  const startLoop = (name: LoopName, rate = 1) => {
    if (!canPlay()) return;
    if (useHtml) startHtmlLoop(name, rate);
    else startWebLoop(name, rate);
  };

  const syncLoops = () => {
    const moving = phase === "walking" || phase === "running";
    const resting = Boolean(opts?.energyRun) && phase === "tired";
    if (!canPlay() || !moving) stopLoop("walk");
    else startLoop("walk", phase === "running" ? 1.15 : 1);
    if (!canPlay() || !resting) stopLoop("tired");
    else startLoop("tired");
  };

  const flushPending = () => {
    if (!pending || !canPlay()) return;
    const name = pending;
    pending = null;
    playOneShot(name);
  };

  const armFromGesture = () => {
    if (dead || !primed) return;
    unlocked = true;
    if (!useHtml) {
      const ctx = audioCtx();
      resumeContext(ctx);
    }
    flushPending();
    syncLoops();
    void decodeAll().then(() => {
      if (dead) return;
      flushPending();
      syncLoops();
    });
  };

  sfxListeners.add(armFromGesture);
  void decodeAll().then(() => {
    if (dead || !unlocked) return;
    flushPending();
    syncLoops();
  });
  if (primed) armFromGesture();

  return {
    unlock() {
      if (!primed) return;
      sharedCtx = unlockGameAudio(sharedCtx);
      armFromGesture();
      void decodeAll().then(() => {
        if (dead) return;
        flushPending();
        syncLoops();
      });
    },
    setMuted(next: boolean) {
      muted = next;
      if (muted) {
        stopLoop("walk");
        stopLoop("tired");
      } else {
        syncLoops();
      }
    },
    setPaused(next: boolean) {
      paused = next;
      if (paused) {
        stopLoop("walk");
        stopLoop("tired");
      } else {
        syncLoops();
      }
    },
    onPhase(next: GamePhase, kind?: HazardKind | null) {
      const prev = phase;
      phase = next;
      if (prev === next) {
        syncLoops();
        return;
      }
      if (next === "waiting" && (prev === "walking" || prev === "running")) {
        stopLoop("walk");
        playOneShot(kind === "duck" ? "bird" : "cliff");
      } else if (next === "tired") {
        stopLoop("walk");
      } else if (next === "jumping") {
        stopLoop("walk");
        stopLoop("tired");
        playOneShot("jump");
      } else if (next === "ducking") {
        stopLoop("walk");
        stopLoop("tired");
        playOneShot("duck");
      } else if (
        next === "running" &&
        (prev === "jumping" || prev === "ducking" || prev === "charging" || prev === "tired")
      ) {
        stopLoop("tired");
        playOneShot("success");
      } else if (next === "clear") {
        stopLoop("walk");
        stopLoop("tired");
        playOneShot("success");
      }
      syncLoops();
    },
    stop() {
      dead = true;
      pending = null;
      sfxListeners.delete(armFromGesture);
      stopWebLoop("walk");
      stopWebLoop("tired");
      if (master) {
        try {
          master.gain.value = 0;
        } catch {
          /* closed */
        }
      }
      htmlNodes.forEach((el) => {
        el.volume = HTML_SILENT;
        try {
          el.pause();
        } catch {
          /* iOS */
        }
      });
    },
  };
}

export type GameSfx = ReturnType<typeof createGameSfx>;

if (typeof window !== "undefined") bindGlobalUnlock();
