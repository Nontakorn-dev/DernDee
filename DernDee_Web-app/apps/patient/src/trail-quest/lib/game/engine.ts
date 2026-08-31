import {
  DINO_FEET_IN_CLIP,
  FLAG_BASE_IN_CLIP,
  FLAG_DRAW_FRAC,
  FLAG_POLE_X,
  FLAG_RATE,
  SCENE_GRASS_FRAC,
  SCENE_SRC_H,
  SCENE_SRC_W,
  sceneCapacity,
  sceneTile,
  tryPlay,
  attachGameClips,
  type CharacterClips,
  type SceneBlit,
} from "@trail/lib/game/assets";
import { getCharacter } from "@trail/lib/game/characters";
import { ChromaBlit } from "@trail/lib/game/chroma";
import { isConstrainedWebKit } from "@trail/lib/game/runtime";
import {
  birdPlacements,
  drawBackdrop,
  drawBirdFlock,
  drawCliffDecor,
  drawDino,
  drawFlag,
  drawPlatforms,
  drawSceneStrip,
  drawSky,
} from "@trail/lib/game/draw";
import type { Encounter, EngineConfig, GamePhase, HudSnapshot, Platform } from "@trail/lib/game/types";
import {
  BIRD_SPEED,
  CHARGE_RATE,
  DECAY_RATE,
  DUCK_DURATION,
  DUCK_SHUFFLE,
  FINISH_TILES,
  HOLD_BONUS_MAX,
  IDLE_ANGLE,
  JUMP_DURATION,
  JUMP_HEIGHT,
  POINTS_PER_JUMP,
  RUN_SPEED,
  WALK_SPEED,
  buildWorld,
  hazardKindFor,
  hazardLabelFor,
  platformAt,
  worldEnd,
} from "@trail/lib/game/world";
import { isEnergyRun } from "@trail/lib/progression";

type InternalState = {
  platforms: Platform[];
  encounters: Encounter[];
  playerX: number;
  airY: number;
  angle: number;
  phase: GamePhase;
  holding: boolean;
  paused: boolean;
  elapsed: number;
  score: number;
  jumpsDone: number;
  runRemaining: number;
  jumpT: number;
  jumpFromX: number;
  jumpToX: number;
  duckT: number;
  duckFromX: number;
  hoverBirdX: number | null;
  approachBird: { x: number; restX: number } | null;
  birdForIndex: number | null;
  passingBirds: { x: number }[];
  cameraX: number;
  time: number;
  bonusThisHold: number;
  cleared: boolean;
};

function currentHazard(state: InternalState): Encounter | null {
  if (state.phase === "jumping" || state.phase === "ducking") {
    return state.encounters[state.jumpsDone - 1] ?? null;
  }
  return state.encounters[state.jumpsDone] ?? null;
}

function hudFrom(state: InternalState, config: EngineConfig): HudSnapshot {
  const end = worldEnd(state.platforms);
  const hazard = currentHazard(state);
  const energy = isEnergyRun(config.chapter);
  return {
    elapsed: state.elapsed,
    score: state.score,
    stage: config.stage,
    chapter: config.chapter,
    progress: Math.min(1, Math.max(0, state.playerX / end)),
    angle: state.angle,
    targetAngle: config.targetAngle,
    phase: state.phase,
    holding: state.holding,
    runRemaining: state.runRemaining,
    paused: state.paused,
    jumpsDone: state.jumpsDone,
    jumpsTotal: energy ? config.gaps : state.encounters.length,
    cleared: state.cleared,
    hazardKind: energy ? null : hazard?.kind ?? null,
    hazardLabel: hazardLabelFor(config.chapter, hazard?.kind ?? null),
  };
}

export function createEngine(canvas: HTMLCanvasElement, config: EngineConfig) {
  const ctx =
    canvas.getContext("2d", { alpha: false, desynchronized: true }) ||
    canvas.getContext("2d", { alpha: false }) ||
    canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  const constrained = isConstrainedWebKit();
  attachGameClips(canvas.parentElement);

  const freeWalk = Boolean(config.freeWalk);
  const { platforms, encounters } = buildWorld(config.chapter, config.gaps, freeWalk);
  const firstWait = encounters[0]?.waitX ?? 280;

  const state: InternalState = {
    platforms,
    encounters,
    playerX: Math.max(88, freeWalk || isEnergyRun(config.chapter) ? 88 : firstWait - 230),
    airY: 0,
    angle: IDLE_ANGLE,
    phase: freeWalk ? "walking" : isEnergyRun(config.chapter) ? "running" : "walking",
    holding: false,
    paused: false,
    elapsed: 0,
    score: config.startScore,
    jumpsDone: 0,
    runRemaining: isEnergyRun(config.chapter) ? config.runSeconds : 0,
    jumpT: 0,
    jumpFromX: 0,
    jumpToX: 0,
    duckT: 0,
    duckFromX: 0,
    hoverBirdX: null,
    approachBird: null,
    birdForIndex: null,
    passingBirds: [],
    cameraX: 0,
    time: 0,
    bonusThisHold: 0,
    cleared: false,
  };

  let raf = 0;
  let last = 0;
  let hudAcc = 0;
  const listeners = new Set<(hud: HudSnapshot) => void>();
  let lastHud = hudFrom(state, config);

  let assets = config.assets ?? null;
  const chroma = new ChromaBlit();
  let lastAnimPhase: GamePhase | null = null;
  let lastSfxPhase: GamePhase | null = null;
  let tiredWrapAt = 0;
  let walkClock = 0;

  const emit = (force = false) => {
    const next = hudFrom(state, config);
    lastHud = next;
    if (force) {
      for (const fn of listeners) fn(next);
    }
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, constrained ? 1.25 : 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
  };

  const worldScale = () => canvas.getBoundingClientRect().height / SCENE_SRC_H;
  const groundY = () => canvas.getBoundingClientRect().height * SCENE_GRASS_FRAC;

  const pauseClips = () => {
    if (!assets) return;
    assets.walk.pause();
    assets.jump.pause();
    assets.duck.pause();
    assets.tired?.pause();
    assets.bird.pause();
    assets.flag.pause();
  };

  const pauseActorClips = () => {
    if (!assets) return;
    assets.walk.pause();
    assets.jump.pause();
    assets.duck.pause();
    assets.tired?.pause();
    assets.bird.pause();
  };

  const birdView = (w: number, h: number, gy: number, scale: number) => ({
    cameraX: state.cameraX,
    groundY: gy,
    scale,
    canvasW: w,
    canvasH: h,
  });

  const birdWorldXs = () => {
    const xs = state.passingBirds.map((b) => b.x);
    if (state.approachBird) xs.push(state.approachBird.x);
    else if (state.hoverBirdX != null) xs.push(state.hoverBirdX);
    return xs;
  };

  const syncAnim = () => {
    if (!assets) return;
    const { walk, jump, duck, bird } = assets;
    if (state.paused) {
      pauseClips();
      return;
    }

    const flag = assets.flag;
    if (flag) {
      flag.playbackRate = FLAG_RATE;
      if (flag.paused) void tryPlay(flag);
    }

    if (state.phase === "clear") {
      pauseActorClips();
      return;
    }

    if (freeWalk || isEnergyRun(config.chapter)) {
      if (!bird.paused) bird.pause();
    } else {
      const rect = canvas.getBoundingClientRect();
      const showBird =
        birdPlacements(birdWorldXs(), birdView(rect.width, rect.height, groundY(), worldScale()))
          .length > 0;
      if (showBird) {
        if (bird.paused) void tryPlay(bird);
      } else if (!bird.paused) {
        bird.pause();
      }
    }

    const spec = getCharacter(assets.characterId);
    const tired = assets.tired;
    if (state.phase === "jumping") {
      duck.pause();
      tired?.pause();
      if (lastAnimPhase !== "jumping") {
        walk.pause();
        jump.pause();
        jump.currentTime = spec.jumpSeek;
        jump.playbackRate = spec.jumpRate;
        void tryPlay(jump);
      }
    } else if (state.phase === "ducking") {
      jump.pause();
      tired?.pause();
      if (lastAnimPhase !== "ducking") {
        walk.pause();
        duck.pause();
        duck.currentTime = spec.duckSeek;
        duck.playbackRate = spec.duckRate;
        void tryPlay(duck);
      }
    } else if (state.phase === "walking" || state.phase === "running") {
      jump.pause();
      duck.pause();
      tired?.pause();
      walk.loop = true;
      walk.playbackRate = state.phase === "running" ? 1.35 : 1;
      const seek = spec.walkSeek;
      const entering = lastAnimPhase !== "walking" && lastAnimPhase !== "running";
      if (entering) {
        walkClock = 0;
        walk.currentTime = seek;
        void tryPlay(walk);
      } else if (walk.paused) {
        void tryPlay(walk);
      } else {
        walkClock += 1;
        // WebKit stalls if we poke currentTime every frame.
        if (walkClock % 12 === 0) {
          const t = walk.currentTime;
          const dur = walk.duration;
          if (t < seek - 0.25) {
            walk.currentTime = seek;
          } else if (Number.isFinite(dur) && dur > seek + 1 && t >= dur - 0.18) {
            walk.currentTime = seek;
            void tryPlay(walk);
          }
        }
      }
    } else if (
      (state.phase === "tired" || state.phase === "charging") &&
      tired &&
      isEnergyRun(config.chapter)
    ) {
      jump.pause();
      duck.pause();
      walk.pause();
      tired.loop = false;
      tired.playbackRate = spec.tiredRate;
      const entering = lastAnimPhase !== "tired" && lastAnimPhase !== "charging";
      const hold = spec.tiredHold;
      const end = Math.max(hold + 0.6, (tired.duration || hold) - 0.04);
      if (entering) {
        tiredWrapAt = 0;
        tired.currentTime = spec.tiredSeek;
        void tryPlay(tired);
      } else if (tired.ended || tired.currentTime >= end) {
        const now = performance.now();
        if (now >= tiredWrapAt) {
          tired.currentTime = hold;
          tiredWrapAt = now + 900;
          void tryPlay(tired);
        } else if (tired.paused) {
          void tryPlay(tired);
        }
      } else if (tired.paused) {
        void tryPlay(tired);
      }
    } else {
      jump.pause();
      duck.pause();
      tired?.pause();
      walk.pause();
      if (lastAnimPhase === "walking" || lastAnimPhase === "running") {
        walk.currentTime = 0;
      }
    }
    lastAnimPhase = state.phase;
  };

  const syncSfx = () => {
    const sfx = config.sfx;
    if (!sfx) return;
    const kind = currentHazard(state)?.kind;
    if (state.paused || state.phase === "clear") {
      if (state.phase === "clear" && lastSfxPhase !== "clear") {
        sfx.onPhase("clear", kind);
      }
      sfx.setPaused(true);
      lastSfxPhase = state.phase;
      return;
    }
    sfx.setPaused(false);
    if (lastSfxPhase !== state.phase) {
      sfx.onPhase(state.phase, kind);
      lastSfxPhase = state.phase;
    }
  };

  const startHazard = (enc: Encounter) => {
    const extra = Math.min(HOLD_BONUS_MAX, Math.round(state.bonusThisHold * 40));
    state.score += POINTS_PER_JUMP + extra;
    state.jumpsDone += 1;
    state.holding = false;
    if (enc.kind === "jump") {
      state.phase = "jumping";
      state.jumpT = 0;
      state.jumpFromX = state.playerX;
      state.jumpToX = enc.jumpToX;
    } else {
      state.phase = "ducking";
      state.duckT = 0;
      state.duckFromX = state.playerX;
      state.passingBirds.push({
        x: state.approachBird?.x ?? state.hoverBirdX ?? enc.hazardX + 140,
      });
      state.hoverBirdX = null;
      state.approachBird = null;
      state.birdForIndex = null;
    }
  };

  const startBoost = () => {
    const extra = Math.min(HOLD_BONUS_MAX, Math.round(state.bonusThisHold * 40));
    state.score += POINTS_PER_JUMP + extra;
    state.jumpsDone += 1;
    state.holding = false;
    state.airY = 0;
    state.phase = "running";
    state.runRemaining = config.runSeconds;
    state.angle = Math.max(IDLE_ANGLE, config.targetAngle * 0.45);
  };

  const finishAction = () => {
    state.airY = 0;
    state.phase = "running";
    state.runRemaining = config.runSeconds;
    state.holding = false;
    state.angle = Math.max(IDLE_ANGLE, config.targetAngle * 0.45);
  };

  const stopAtUpcoming = (upcoming: Encounter) => {
    state.playerX = upcoming.waitX;
    state.runRemaining = 0;
    state.phase = "waiting";
    state.bonusThisHold = 0;
  };

  const update = (dt: number) => {
    state.time += dt;
    state.elapsed += dt;

    if (freeWalk) {
      state.phase = "walking";
      state.airY = 0;
      state.playerX += WALK_SPEED * dt;
      const viewW = canvas.getBoundingClientRect().width;
      const scale = worldScale();
      const viewWorld = scale > 0 ? viewW / scale : viewW;
      const focus = state.playerX - viewWorld * 0.38;
      state.cameraX += (Math.max(0, focus) - state.cameraX) * Math.min(1, dt * 6);
      return;
    }

    if (isEnergyRun(config.chapter)) {
      if (state.holding && (state.phase === "tired" || state.phase === "charging")) {
        state.phase = "charging";
        state.angle = Math.min(config.targetAngle + 10, state.angle + CHARGE_RATE * dt);
        state.bonusThisHold += dt;
        if (state.angle >= config.targetAngle) startBoost();
      } else if (state.phase === "charging") {
        state.phase = "tired";
      }

      if (!state.holding) {
        if (state.angle > IDLE_ANGLE) {
          state.angle = Math.max(IDLE_ANGLE, state.angle - DECAY_RATE * dt);
        }
      }

      if (state.phase === "tired" || state.phase === "charging") {
        state.airY = 3 + Math.sin(state.time * 2.1) * 2;
      }

      if (state.phase === "running") {
        state.airY = 0;
        const end = worldEnd(state.platforms);
        const nextX = state.playerX + RUN_SPEED * dt;
        if (nextX >= end - 12) {
          state.playerX = end - 8;
          state.phase = "clear";
          state.cleared = true;
        } else {
          state.playerX = nextX;
          state.runRemaining = Math.max(0, state.runRemaining - dt);
          if (state.runRemaining <= 0 && state.jumpsDone < config.gaps) {
            state.phase = "tired";
            state.runRemaining = 0;
            state.bonusThisHold = 0;
            state.holding = false;
          }
        }
      }
    } else if (state.holding && (state.phase === "waiting" || state.phase === "charging")) {
      state.phase = "charging";
      state.angle = Math.min(config.targetAngle + 10, state.angle + CHARGE_RATE * dt);
      state.bonusThisHold += dt;
      if (state.angle >= config.targetAngle) {
        const enc = state.encounters[state.jumpsDone];
        if (enc) startHazard(enc);
      }
    } else if (state.phase === "charging") {
      state.phase = "waiting";
    }

    if (!isEnergyRun(config.chapter)) {
      if (!state.holding && state.phase !== "jumping" && state.phase !== "ducking") {
        if (state.angle > IDLE_ANGLE) {
          state.angle = Math.max(IDLE_ANGLE, state.angle - DECAY_RATE * dt);
        }
      }

      if (state.phase === "walking") {
        const upcoming = state.encounters[state.jumpsDone];
        if (!upcoming) {
          const end = worldEnd(state.platforms);
          state.playerX = Math.min(end - 8, state.playerX + WALK_SPEED * dt);
          if (state.playerX >= end - 12) {
            state.phase = "clear";
            state.cleared = true;
          }
        } else if (state.playerX < upcoming.waitX) {
          state.playerX += WALK_SPEED * dt;
        } else {
          state.playerX = upcoming.waitX;
          state.phase = "waiting";
          state.bonusThisHold = 0;
        }
      }

      if (state.phase === "jumping") {
        state.jumpT += dt;
        const u = Math.min(1, state.jumpT / JUMP_DURATION);
        const eased = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        state.playerX = state.jumpFromX + (state.jumpToX - state.jumpFromX) * eased;
        const lift = assets ? getCharacter(assets.characterId).jumpLift : 1;
        state.airY = 4 * JUMP_HEIGHT * u * (1 - u) * lift;
        if (u >= 1) {
          state.playerX = state.jumpToX;
          finishAction();
        }
      }

      if (state.phase === "ducking") {
        state.duckT += dt;
        const u = Math.min(1, state.duckT / DUCK_DURATION);
        state.playerX = state.duckFromX + DUCK_SHUFFLE * u;
        state.airY = 0;
        if (u >= 1) finishAction();
      }

      if (state.phase === "running") {
        const upcoming = state.encounters[state.jumpsDone];
        const nextX = state.playerX + RUN_SPEED * dt;
        if (upcoming && nextX >= upcoming.waitX) {
          stopAtUpcoming(upcoming);
        } else {
          const current = platformAt(state.platforms, state.playerX);
          if (current && nextX > current.x + current.width - 12) {
            state.playerX = current.x + current.width - 12;
            state.runRemaining = 0;
            const lastPlat = state.platforms[state.platforms.length - 1];
            state.phase = current === lastPlat ? "walking" : "waiting";
            state.bonusThisHold = 0;
          } else {
            state.playerX = nextX;
            state.runRemaining = Math.max(0, state.runRemaining - dt);
            if (state.runRemaining <= 0) {
              state.phase = "walking";
            }
          }
        }
      }
    }

    const viewW = canvas.getBoundingClientRect().width;
    const scale = worldScale();
    const viewWorld = scale > 0 ? viewW / scale : viewW;
    const focus = state.playerX - viewWorld * 0.38;
    state.cameraX += (Math.max(0, focus) - state.cameraX) * Math.min(1, dt * 6);

    const upcoming = state.encounters[state.jumpsDone];
    const duckIncoming =
      !isEnergyRun(config.chapter) &&
      upcoming?.kind === "duck" &&
      (state.phase === "walking" ||
        state.phase === "running" ||
        state.phase === "waiting" ||
        state.phase === "charging");
    if (duckIncoming) {
      const restX = upcoming.waitX + 280;
      if (state.birdForIndex !== state.jumpsDone) {
        const rightEdge = state.cameraX + viewWorld + 260;
        const spawnX = Math.max(rightEdge, restX + 240);
        const timeBird = Math.max(0.05, (spawnX - restX) / BIRD_SPEED);
        const speed =
          state.phase === "running" ? RUN_SPEED : state.phase === "walking" ? WALK_SPEED : 0;
        const timePlayer =
          speed > 0 ? Math.max(0, (upcoming.waitX - state.playerX) / speed) : 0;
        if (speed === 0 || timePlayer <= timeBird + 1) {
          state.birdForIndex = state.jumpsDone;
          state.hoverBirdX = null;
          state.approachBird = { x: spawnX, restX };
        }
      }
      if (state.approachBird) {
        state.approachBird.x -= BIRD_SPEED * dt;
        if (state.approachBird.x <= state.approachBird.restX) {
          state.hoverBirdX = state.approachBird.restX;
          state.approachBird = null;
        }
      }
    } else if (state.phase !== "ducking") {
      state.approachBird = null;
      state.hoverBirdX = null;
      state.birdForIndex = null;
    }
    for (const b of state.passingBirds) {
      b.x -= BIRD_SPEED * dt;
    }
    const leaveX = state.cameraX - 420;
    state.passingBirds = state.passingBirds.filter((b) => b.x > leaveX);
  };

  const render = () => {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w < 8 || h < 8) return;
    const gy = groundY();
    const scale = worldScale();
    ctx.clearRect(0, 0, w, h);

    const sceneCount = Math.min(config.gaps, assets ? sceneCapacity(assets) : 0);
    if (assets && sceneCount > 0) {
      const tiles: SceneBlit[] = [];
      for (let i = 0; i < sceneCount; i += 1) {
        const kind = hazardKindFor(config.chapter, i) === "duck" ? "duck" : "jump";
        const tile = sceneTile(assets, kind, i) ?? sceneTile(assets, kind === "duck" ? "jump" : "duck", i);
        if (tile) tiles.push(tile);
      }
      for (let j = 0; j < FINISH_TILES; j += 1) {
        const tile = sceneTile(assets, "duck", sceneCount + j) ?? sceneTile(assets, "jump", sceneCount + j);
        if (tile) tiles.push(tile);
      }
      drawSceneStrip(ctx, tiles, state.cameraX, w, h, SCENE_SRC_W, SCENE_SRC_H);
    } else {
      drawSky(ctx, w, h, gy);
      drawBackdrop(ctx, w, h, gy, state.cameraX, state.time);
      drawPlatforms(ctx, state.platforms, gy, state.cameraX, h, state.time);
      drawCliffDecor(ctx, state.platforms, gy, state.cameraX);
    }

    const flagX = worldEnd(state.platforms);
    const flagPx = (flagX - state.cameraX) * scale;
    if (!freeWalk && assets?.flag) {
      const flagH = h * FLAG_DRAW_FRAC;
      const flagW = flagH;
      const dx = flagPx - flagW * FLAG_POLE_X;
      const dy = gy - flagH * FLAG_BASE_IN_CLIP;
      const glow = 0.2 + Math.sin(state.time * 2.4) * 0.05;
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.fillStyle = "#ffe27a";
      ctx.beginPath();
      ctx.ellipse(
        flagPx,
        dy + flagH * 0.16,
        flagW * 0.16,
        flagH * 0.14,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(70,55,35,1)";
      ctx.beginPath();
      ctx.ellipse(flagPx, gy + flagH * 0.01, flagW * 0.12, flagH * 0.022, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      chroma.draw(ctx, assets.flag, dx, dy, flagW, flagH);
    } else if (!freeWalk) {
      drawFlag(ctx, flagX, gy, state.cameraX, state.time, scale);
    }

    const screenX = (state.playerX - state.cameraX) * scale;
    const screenY = gy - state.airY * scale;
    const spec = assets ? getCharacter(assets.characterId) : null;
    const destH = h * (spec?.drawHeightFrac ?? 0.42);
    const destW = destH;
    const feet = destH * (spec?.feetInClip ?? DINO_FEET_IN_CLIP);
    let clip: HTMLVideoElement | null = null;
    if (assets) {
      if (state.phase === "jumping") clip = assets.jump;
      else if (state.phase === "ducking") clip = assets.duck;
      else if (
        (state.phase === "tired" || state.phase === "charging") &&
        assets.tired &&
        isEnergyRun(config.chapter)
      ) {
        clip = assets.tired;
      } else clip = assets.walk;
    }

    if (clip) {
      const dx = screenX - destW * 0.48;
      const dy = screenY - feet;
      const lift = state.airY * scale;
      if (lift < 18) {
        ctx.save();
        ctx.globalAlpha = 0.28 * (1 - lift / 18);
        ctx.fillStyle = "rgba(70,55,35,1)";
        ctx.beginPath();
        ctx.ellipse(screenX, gy + destH * 0.012, destW * 0.16, destH * 0.028, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      chroma.draw(ctx, clip, dx, dy, destW, destH);
      if (state.holding && (state.phase === "charging" || state.phase === "waiting" || state.phase === "tired")) {
        ctx.strokeStyle = "rgba(110,200,80,0.55)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(
          screenX,
          screenY - destH * 0.42,
          Math.max(6, destH * 0.34 + Math.sin(state.time * 8) * 2),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    } else {
      drawDino(
        ctx,
        screenX,
        gy,
        state.time,
        state.phase,
        state.airY * scale,
        state.holding && (state.phase === "charging" || state.phase === "waiting" || state.phase === "tired"),
      );
    }

    if (!freeWalk && !isEnergyRun(config.chapter)) {
      const placements = birdPlacements(birdWorldXs(), birdView(w, h, gy, scale));
      if (assets?.bird && placements.length > 0) {
        for (const p of placements) {
          chroma.draw(ctx, assets.bird, p.x - p.size * 0.5, p.y - p.size * 0.55, p.size, p.size);
        }
      } else {
        drawBirdFlock(ctx, birdWorldXs(), { ...birdView(w, h, gy, scale), time: state.time });
      }
    }
  };

  const loop = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (!state.paused && state.phase !== "clear") update(dt);
    else state.time += dt * 0.15;
    syncAnim();
    syncSfx();
    render();
    hudAcc += dt;
    if (
      hudAcc >= 0.05 ||
      state.phase === "clear" ||
      state.phase === "waiting" ||
      state.phase === "tired" ||
      state.phase === "ducking"
    ) {
      hudAcc = 0;
      emit(true);
    }
    raf = requestAnimationFrame(loop);
  };

  return {
    start() {
      resize();
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      window.addEventListener("resize", resize);
      emit(true);
    },
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      pauseClips();
      chroma.dispose();
      config.sfx?.stop();
    },
    unlock() {
      if (assets) {
        void tryPlay(assets.walk);
        void tryPlay(assets.flag);
      }
      config.sfx?.unlock();
    },
    setHolding(next: boolean) {
      if (
        state.paused ||
        state.phase === "clear" ||
        state.phase === "jumping" ||
        state.phase === "ducking" ||
        state.phase === "running"
      ) {
        if (!next) state.holding = false;
        return;
      }
      state.holding = next;
      if (next && (state.phase === "waiting" || state.phase === "tired")) {
        state.phase = "charging";
        state.bonusThisHold = 0;
      }
    },
    setPaused(next: boolean) {
      state.paused = next;
      emit(true);
    },
    subscribe(fn: (hud: HudSnapshot) => void) {
      listeners.add(fn);
      fn(lastHud);
      return () => listeners.delete(fn);
    },
    snapshot() {
      return lastHud;
    },
    setCharacterClips(clips: CharacterClips) {
      if (assets) {
        assets.walk.pause();
        assets.jump.pause();
        assets.duck.pause();
        assets.tired?.pause();
        assets.characterId = clips.characterId;
        assets.walk = clips.walk;
        assets.jump = clips.jump;
        assets.duck = clips.duck;
        assets.tired = clips.tired;
      }
      lastAnimPhase = null;
    },
  };
}

export type GameEngine = ReturnType<typeof createEngine>;
