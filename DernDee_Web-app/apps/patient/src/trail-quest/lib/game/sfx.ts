import { getGameAudioContext, unlockGameAudio } from "@shared/audio/unlockGameAudio.js";
import type { GamePhase, HazardKind } from "@trail/lib/game/types";

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

let sharedCtx: AudioContext | null = null;

function audioCtx() {
  sharedCtx = getGameAudioContext(sharedCtx);
  return sharedCtx;
}

/** Call from a tap so Web Audio / iOS autoplay is armed. */
export function primeGameAudio() {
  if (typeof window === "undefined") return;
  sharedCtx = unlockGameAudio(sharedCtx);
}

export function createGameSfx(opts?: { energyRun?: boolean }) {
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
  let unlocked = false;
  let paused = false;
  let phase: GamePhase = "walking";
  let pending: SfxName | null = null;
  let walkSrc: AudioBufferSourceNode | null = null;
  let tiredSrc: AudioBufferSourceNode | null = null;
  let master: GainNode | null = null;

  const canPlay = () => unlocked && !muted && !paused;

  const decodeAll = async () => {
    const ctx = audioCtx();
    if (!ctx) return;
    await Promise.all(
      (Object.keys(SFX_URLS) as SfxName[]).map(async (name) => {
        if (buffers.has(name)) return;
        const res = await fetch(SFX_URLS[name]);
        const raw = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(raw.slice(0));
        buffers.set(name, buf);
      }),
    );
  };

  const ensureMaster = () => {
    const ctx = audioCtx();
    if (!ctx) return null;
    if (!master) {
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    return ctx;
  };

  const playOneShot = (name: SfxName) => {
    if (!canPlay()) {
      if (!unlocked) pending = name;
      return;
    }
    const ctx = ensureMaster();
    const buf = buffers.get(name);
    if (!ctx || !buf || !master) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.value = volumes[name];
    src.connect(gain);
    gain.connect(master);
    src.start(0);
  };

  const stopLoop = (which: "walk" | "tired") => {
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

  const startLoop = (name: "walk" | "tired", rate = 1) => {
    const ctx = ensureMaster();
    const buf = buffers.get(name);
    if (!ctx || !buf || !master || !canPlay()) return;
    if (name === "walk" && walkSrc) {
      walkSrc.playbackRate.value = rate;
      return;
    }
    if (name === "tired" && tiredSrc) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    gain.gain.value = volumes[name];
    src.connect(gain);
    gain.connect(master);
    src.start(0);
    if (name === "walk") {
      walkSrc = src;
    } else {
      tiredSrc = src;
    }
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

  void decodeAll();

  return {
    unlock() {
      unlocked = true;
      primeGameAudio();
      void decodeAll().then(() => {
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
      stopLoop("walk");
      stopLoop("tired");
    },
  };
}

export type GameSfx = ReturnType<typeof createGameSfx>;
