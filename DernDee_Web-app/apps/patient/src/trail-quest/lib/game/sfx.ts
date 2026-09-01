import { unlockGameAudio } from "@shared/audio/unlockGameAudio.js";
import type { GamePhase, HazardKind } from "@trail/lib/game/types";

function makeClip(src: string, loop = false) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.loop = loop;
  audio.playsInline = true;
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  return audio;
}

/** Call from a tap so Web Audio / iOS autoplay is armed. Does not unlock Trail Quest clips. */
export function primeGameAudio() {
  if (typeof window === "undefined") return;
  unlockGameAudio();
}

export function createGameSfx(opts?: { energyRun?: boolean }) {
  const walk = makeClip("/game/sfx/walk.wav", true);
  const tired = makeClip("/game/sfx/tired.wav", true);
  const cliff = makeClip("/game/sfx/cliff.wav");
  const jump = makeClip("/game/sfx/jump.wav");
  const success = makeClip("/game/sfx/success.wav");
  const bird = makeClip("/game/sfx/bird.wav");
  const duck = makeClip("/game/sfx/duck.wav");
  walk.volume = 0.12;
  tired.volume = 0.11;
  cliff.volume = 0.5;
  jump.volume = 0.48;
  success.volume = 0.52;
  bird.volume = 0.32;
  duck.volume = 0.42;

  const all = [walk, tired, cliff, jump, success, bird, duck];
  const armed = new WeakSet<HTMLAudioElement>();

  let muted = false;
  let unlocked = false;
  let paused = false;
  let phase: GamePhase = "walking";
  let pending: HTMLAudioElement | null = null;

  const canPlay = () => unlocked && !muted && !paused;

  const restart = (clip: HTMLAudioElement) => {
    clip.muted = false;
    try {
      if (clip.currentTime > 0.04) clip.currentTime = 0;
    } catch {
      /* iOS may still be buffering */
    }
    void clip.play().catch(() => {});
  };

  const playOne = (clip: HTMLAudioElement) => {
    if (!unlocked) {
      pending = clip;
      return;
    }
    if (!canPlay()) return;
    pending = null;
    restart(clip);
  };

  const flushPending = () => {
    if (!pending || !canPlay()) return;
    const clip = pending;
    pending = null;
    restart(clip);
  };

  const syncLoops = () => {
    const moving = phase === "walking" || phase === "running";
    const resting = Boolean(opts?.energyRun) && phase === "tired";
    if (!canPlay() || !moving) {
      if (!walk.paused) walk.pause();
    } else {
      walk.playbackRate = phase === "running" ? 1.15 : 1;
      walk.muted = false;
      if (walk.paused) void walk.play().catch(() => {});
    }
    if (!canPlay() || !resting) {
      if (!tired.paused) tired.pause();
    } else if (tired.paused) {
      tired.muted = false;
      void tired.play().catch(() => {});
    }
  };

  const armClip = (clip: HTMLAudioElement) => {
    if (armed.has(clip)) return;
    clip.muted = true;
    void clip
      .play()
      .then(() => {
        armed.add(clip);
        if (clip.muted) {
          clip.pause();
          try {
            clip.currentTime = 0;
          } catch {
            /* iOS may still be buffering */
          }
          clip.muted = false;
        }
        if (clip === walk || clip === tired) syncLoops();
      })
      .catch(() => {
        clip.muted = false;
      });
  };

  return {
    unlock() {
      unlocked = true;
      unlockGameAudio();
      for (const clip of all) armClip(clip);
      flushPending();
      syncLoops();
    },
    setMuted(next: boolean) {
      muted = next;
      if (muted) {
        for (const clip of all) clip.pause();
      } else {
        syncLoops();
      }
    },
    setPaused(next: boolean) {
      paused = next;
      if (paused) {
        walk.pause();
        tired.pause();
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
        walk.pause();
        playOne(kind === "duck" ? bird : cliff);
      } else if (next === "tired") {
        walk.pause();
      } else if (next === "jumping") {
        walk.pause();
        tired.pause();
        playOne(jump);
      } else if (next === "ducking") {
        walk.pause();
        tired.pause();
        playOne(duck);
      } else if (
        next === "running" &&
        (prev === "jumping" || prev === "ducking" || prev === "charging" || prev === "tired")
      ) {
        tired.pause();
        playOne(success);
      } else if (next === "clear") {
        walk.pause();
        tired.pause();
        playOne(success);
      }
      syncLoops();
    },
    stop() {
      for (const clip of all) clip.pause();
    },
  };
}

export type GameSfx = ReturnType<typeof createGameSfx>;
