import { GameHeader, HeaderIconButton } from "@trail/components/game/GameHeader";
import { GameHud } from "@trail/components/game/Hud";
import { SettingsButton, SettingsModal } from "@trail/components/game/SettingsModal";
import {
  hydrateGameAssets,
  loadCharacterClips,
  loadPlayableAssets,
  preloadWorldAssets,
  sceneSeasonForStage,
  type GameAssets,
} from "@trail/lib/game/assets";
import type { CharacterId } from "@trail/lib/game/characters";
import { createEngine, type GameEngine } from "@trail/lib/game/engine";
import { createGameSfx, primeGameAudio, type GameSfx } from "@trail/lib/game/sfx";
import type { HudSnapshot } from "@trail/lib/game/types";
import { loadSettings, writeSettings } from "@trail/lib/settings";
import {
  applyStageClear,
  getChapter,
  getStage,
  hydrateSave,
  loadSave,
  nextDestination,
  chapterNeedsJump,
  isEnergyRun,
  type MovementKind,
  writeSave,
} from "@trail/lib/progression";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

const INITIAL: HudSnapshot = {
  elapsed: 0,
  score: 850,
  stage: 3,
  chapter: "dorsiflexor",
  progress: 0.42,
  angle: 8,
  targetAngle: 20,
  phase: "walking",
  holding: false,
  runRemaining: 0,
  paused: false,
  jumpsDone: 0,
  jumpsTotal: 5,
  cleared: false,
  hazardKind: "duck",
  hazardLabel: "นก",
};

export function GameScreen({
  chapterId,
  stageId,
}: {
  chapterId: MovementKind;
  stageId: number;
}) {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({
    ...INITIAL,
    stage: stageId,
    chapter: chapterId,
    score: 0,
    targetAngle: getStage(chapterId, stageId).targetAngle,
  });
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [character, setCharacter] = useState<CharacterId>("boy");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const startScoreRef = useRef(0);
  const savedRef = useRef(false);
  const sfxRef = useRef<GameSfx | null>(null);
  const mutedRef = useRef(false);
  const pausedRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const leavingRef = useRef(false);
  const storyOpenRef = useRef(false);

  const chapter = getChapter(chapterId);
  const stage = getStage(chapterId, stageId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    savedRef.current = false;
    setStoryOpen(false);
    storyOpenRef.current = false;
    setPaused(false);
    pausedRef.current = false;
    setSettingsOpen(false);
    settingsOpenRef.current = false;
    setLoading(true);
    let cancelled = false;
    const settings = loadSettings();
    mutedRef.current = settings.muted;
    setMuted(settings.muted);
    setCharacter(settings.character);

    const startEngine = (assets: GameAssets | undefined, startScore: number) => {
      if (cancelled) return;
      startScoreRef.current = startScore;
      const sfx = createGameSfx({ energyRun: isEnergyRun(chapterId) });
      sfx.setMuted(mutedRef.current);
      sfxRef.current = sfx;
      const engine = createEngine(canvas, {
        chapter: chapterId,
        stage: stageId,
        gaps: stage.gaps,
        targetAngle: stage.targetAngle,
        runSeconds: stage.runSeconds,
        startScore,
        assets,
        sfx,
      });
      engineRef.current = engine;
      const unsub = engine.subscribe((next) => {
        setHud(next);
        if (next.cleared && !savedRef.current) {
          savedRef.current = true;
          storyOpenRef.current = true;
          engine.setHolding(false);
          const earned = Math.max(0, next.score - startScoreRef.current);
          writeSave(applyStageClear(loadSave(), chapterId, stageId, earned));
          setStoryOpen(true);
        }
      });
      engine.start();
      engine.setPaused(pausedRef.current || settingsOpenRef.current);
      setLoading(false);
      cleanup = () => {
        unsub();
        engine.stop();
        sfx.stop();
        engineRef.current = null;
        sfxRef.current = null;
      };
    };

    const season = sceneSeasonForStage(stageId);
    const needJump = chapterNeedsJump(chapterId);
    void Promise.all([
      loadPlayableAssets(settings.character, season, needJump, isEnergyRun(chapterId)).catch(() =>
        loadPlayableAssets("dino", season, needJump, isEnergyRun(chapterId)),
      ),
      hydrateSave(),
    ])
      .then(([assets, daySave]) => {
        if (cancelled) return;
        startEngine(assets, daySave.totalScore);
        void hydrateGameAssets(assets, season, needJump).catch(() => {});
      })
      .catch(() => {
        if (cancelled) return;
        startEngine(undefined, loadSave().totalScore);
      });

    let cleanup = () => {
      engineRef.current?.stop();
      engineRef.current = null;
      sfxRef.current?.stop();
      sfxRef.current = null;
    };

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [chapterId, stageId, stage.gaps, stage.runSeconds, stage.targetAngle]);

  useEffect(() => {
    const release = () => engineRef.current?.setHolding(false);
    const unlockAudio = () => {
      primeGameAudio();
      engineRef.current?.unlock();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("pointerdown", unlockAudio, { capture: true });
    window.addEventListener("keydown", unlockAudio, { capture: true });
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("pointerdown", unlockAudio, { capture: true } as EventListenerOptions);
      window.removeEventListener("keydown", unlockAudio, { capture: true } as EventListenerOptions);
    };
  }, []);

  const dest = nextDestination(chapterId, stageId);

  useEffect(() => {
    if (!storyOpen) return;
    if (dest.kind === "stage") {
      preloadWorldAssets(sceneSeasonForStage(dest.stage), chapterNeedsJump(dest.chapter));
    } else if (dest.kind === "chapter") {
      preloadWorldAssets(sceneSeasonForStage(1), chapterNeedsJump(dest.chapter));
    }
  }, [storyOpen, dest.kind, dest.chapter, dest.stage]);

  const setHold = (next: boolean) => engineRef.current?.setHolding(next);

  const syncEnginePause = () => {
    engineRef.current?.setPaused(pausedRef.current || settingsOpenRef.current);
  };

  const togglePause = (next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
    if (next) setHold(false);
    syncEnginePause();
    if (!next) engineRef.current?.unlock();
  };

  const openSettings = () => {
    settingsOpenRef.current = true;
    setSettingsOpen(true);
    syncEnginePause();
  };

  const closeSettings = () => {
    settingsOpenRef.current = false;
    setSettingsOpen(false);
    syncEnginePause();
    if (!pausedRef.current) engineRef.current?.unlock();
  };

  const setMutedPref = (next: boolean) => {
    mutedRef.current = next;
    setMuted(next);
    writeSettings({ muted: next });
    sfxRef.current?.setMuted(next);
    if (!next) engineRef.current?.unlock();
  };

  const setCharacterPref = (id: CharacterId) => {
    if (id === character) return;
    setCharacter(id);
    writeSettings({ character: id });
    const engine = engineRef.current;
    if (!engine) return;
    setSwitching(true);
    void loadCharacterClips(id)
      .then((clips) => {
        engine.setCharacterClips(clips);
      })
      .finally(() => setSwitching(false));
  };

  const lastUiTap = useRef(0);
  const uiAction = (fn: () => void) => ({
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      if (e.pointerType === "mouse" && e.button !== 0) return;
      lastUiTap.current = Date.now();
      fn();
    },
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (Date.now() - lastUiTap.current < 500) return;
      fn();
    },
  });

  const goTo = (href: string) => {
    primeGameAudio();
    if (leavingRef.current) return;
    leavingRef.current = true;
    setHold(false);
    engineRef.current?.stop();
    sfxRef.current?.stop();
    setLeaving(true);
    navigate(href);
  };

  const modalOpen = storyOpen || paused || settingsOpen;
  const nextHref =
    dest.kind === "stage"
      ? `/play?chapter=${dest.chapter}&stage=${dest.stage}`
      : dest.kind === "chapter"
        ? `/play?chapter=${dest.chapter}&stage=1`
        : "/map";

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200"
      style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
    >
      <GameHeader
        backHref="/map"
        homeHref="/map"
        onNavigate={goTo}
        actions={
          <>
            <SettingsButton onClick={openSettings} />
            <HeaderIconButton label="หยุดชั่วคราว" onClick={() => togglePause(true)}>
              <span className="flex gap-1">
                <span className="h-4 w-[4px] rounded-sm bg-current" />
                <span className="h-4 w-[4px] rounded-sm bg-current" />
              </span>
            </HeaderIconButton>
          </>
        }
      />

      <main className="relative z-0 min-h-0 flex-1">
        <section
          className={`absolute inset-0 select-none overflow-hidden bg-[#b7e4f6] ${
            modalOpen ? "pointer-events-none" : "touch-none"
          }`}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 h-full w-full touch-none"
            onPointerDown={() => {
              if (storyOpenRef.current || pausedRef.current || settingsOpenRef.current) return;
              engineRef.current?.unlock();
              setHold(true);
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
          {loading || switching ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#b7e4f6]/80 text-[16px] font-semibold text-[#4a7c9b]">
              {switching ? "กำลังเปลี่ยนตัวละคร…" : "กำลังจัดฉาก…"}
            </div>
          ) : null}
          <GameHud hud={hud} />
        </section>
      </main>

      <SettingsModal
        open={settingsOpen}
        muted={muted}
        character={character}
        onClose={closeSettings}
        onMutedChange={setMutedPref}
        onCharacterChange={setCharacterPref}
      />

      {paused ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="text-xl font-extrabold text-gray-800">หยุดพัก</div>
            <p className="mt-2 text-sm text-gray-500">การเดินทางยังอยู่ตรงนี้ กลับมาเมื่อพร้อม</p>
            <button
              type="button"
              className="mt-5 min-h-12 w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white hover:bg-blue-700"
              {...uiAction(() => togglePause(false))}
            >
              เล่นต่อ
            </button>
            <button
              type="button"
              className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-gray-100 py-3 text-base font-bold text-gray-700 hover:bg-gray-200"
              {...uiAction(() => goTo("/map"))}
            >
              เลือกเกม
            </button>
          </div>
        </div>
      ) : null}

      {storyOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl">
              ⭐
            </div>
            <div className="text-sm font-semibold text-emerald-600">ปลดล็อกเนื้อเรื่อง</div>
            <h2 className="mt-1 text-xl font-extrabold text-gray-800">{stage.story.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{stage.story.body}</p>
            <p className="mt-3 text-sm font-semibold text-emerald-600">
              +{Math.max(0, hud.score - startScoreRef.current)} คะแนน
            </p>
            {dest.kind === "stage" ? (
              <button
                type="button"
                disabled={leaving}
                className="mt-5 min-h-12 w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white hover:bg-blue-700 disabled:opacity-80"
                {...uiAction(() => goTo(nextHref))}
              >
                {leaving ? "กำลังไป…" : `เล่นต่อ · ${getStage(dest.chapter, dest.stage).name}`}
              </button>
            ) : dest.kind === "chapter" ? (
              <button
                type="button"
                disabled={leaving}
                className="mt-5 min-h-12 w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white hover:bg-blue-700 disabled:opacity-80"
                {...uiAction(() => goTo(nextHref))}
              >
                {leaving ? "กำลังไป…" : `ปลดล็อก ${getChapter(dest.chapter).title}`}
              </button>
            ) : (
              <button
                type="button"
                disabled={leaving}
                className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-base font-bold text-white hover:bg-blue-700 disabled:opacity-80"
                {...uiAction(() => goTo("/map"))}
              >
                {leaving ? "กำลังไป…" : "เลือกเกม"}
              </button>
            )}
            <button
              type="button"
              className="mt-3 flex min-h-11 w-full items-center justify-center text-sm font-medium text-gray-400"
              {...uiAction(() => goTo("/map"))}
            >
              กลับไปเลือกเกม
            </button>
          </div>
        </div>
      ) : null}

      {leaving ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#b7e4f6]/90 text-base font-semibold text-[#4a7c9b]">
          กำลังไป…
        </div>
      ) : null}

      <p className="sr-only">
        {chapter.title} {stage.name}
      </p>
    </div>
  );
}
