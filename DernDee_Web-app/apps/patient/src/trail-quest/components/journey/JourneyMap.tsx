import { GameHeader } from "@trail/components/game/GameHeader";
import { SettingsButton, SettingsModal } from "@trail/components/game/SettingsModal";
import type { CharacterId } from "@trail/lib/game/characters";
import { primeGameAudio } from "@trail/lib/game/sfx";
import {
  CHAPTERS,
  chapterLockHint,
  emptySave,
  hydrateSave,
  isChapterUnlocked,
  isStageUnlocked,
  loadSave,
  nextPlayable,
  nextPlayableInChapter,
  type MovementKind,
} from "@trail/lib/progression";
import { loadSettings, writeSettings } from "@trail/lib/settings";
import { isTouchInputParam, withTouchInput } from "@trail/lib/sensorInput";
import { kitFromBleDevices, canPlayChapterWithKit, type TrailKit, type TrailKitDetection } from "@trail/lib/trailKit";
import {
  getBrowserBleDevicesSnapshot,
  subscribeToBrowserBleDevices,
} from "@shared/gateway/realtimeTransport.js";
import { trailGuidesForChapter } from "@shared/sensors/sensorPlacementGuides.js";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import SensorPlacementSheet from "@patient/components/SensorPlacementSheet.jsx";

const GAME_ICONS: Record<MovementKind, { src: string; alt: string }> = {
  dorsiflexor: { src: "/game/icons/icon-sky-duck.png", alt: "Sky Duck" },
  plantarflexor: { src: "/game/icons/icon-boost-dash.png", alt: "Boost Dash" },
  "hip-flexor": { src: "/game/icons/icon-cliff-hopper.png", alt: "Cliff Hopper" },
  combined: { src: "/game/icons/icon-wild-trail.png", alt: "Wild Trail" },
};

export function JourneyMap() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const allowTouch = isTouchInputParam(params);
  const [save, setSave] = useState(() => emptySave());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [character, setCharacter] = useState<CharacterId>("boy");
  const [testKit, setTestKit] = useState<TrailKit>(() => loadSettings().testKit);
  const [guide, setGuide] = useState<ReturnType<typeof trailGuidesForChapter> | null>(null);
  const [detection, setDetection] = useState<TrailKitDetection | "unknown">(() =>
    allowTouch ? loadSettings().testKit : kitFromBleDevices(getBrowserBleDevicesSnapshot()),
  );

  useEffect(() => {
    setSave(loadSave());
    void hydrateSave().then(setSave);
    const settings = loadSettings();
    setMuted(settings.muted);
    setCharacter(settings.character);
    setTestKit(settings.testKit);
  }, []);

  useEffect(() => {
    if (allowTouch) {
      setDetection(testKit);
      return undefined;
    }
    const sync = (devices: Array<{ positionId?: string; status?: string }> = []) => {
      setDetection(kitFromBleDevices(devices));
    };
    sync(getBrowserBleDevicesSnapshot());
    return subscribeToBrowserBleDevices(sync);
  }, [allowTouch, testKit]);

  const next = nextPlayable(save, detection);
  const continueHref = withTouchInput(`/play?chapter=${next.chapter}&stage=${next.stage}`, allowTouch);
  const nextReady = CHAPTERS.some((chapter) => isChapterUnlocked(chapter, save, detection));

  const openGuide = (chapterId: MovementKind) => {
    setGuide(trailGuidesForChapter(chapterId));
  };

  return (
    <div
      className="min-h-dvh bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200"
      style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
    >
      <GameHeader
        backHref="/therapy"
        homeHref="/therapy"
        actions={<SettingsButton onClick={() => setSettingsOpen(true)} />}
      />

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-500">StepDee</p>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight text-slate-800 sm:text-4xl">
            เส้นทางเดินดี
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-slate-500">
            ก้มหลบนก พุ่งสุดแรง กระโดดข้ามเหว แล้วปลดล็อกด่านต่อไป ความคืบหน้าวันนี้เก็บไว้จนเที่ยงคืน แล้วเริ่มใหม่ทั้งด่าน
          </p>
          {allowTouch ? (
            <p className="mt-2 text-sm font-semibold text-amber-600">
              โหมดทดสอบระบบ · กดค้างที่จอได้ เข้าเล่นจาก Therapy จะต้องใช้เซนเซอร์จริง
              เลือกชุดป่าจังหวะได้ในตั้งค่า
            </p>
          ) : null}
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg">
            <span className="text-lg" aria-hidden>
              ⭐
            </span>
            <span className="text-lg font-bold text-slate-800">{save.totalScore}</span>
            <span className="text-sm text-gray-400">คะแนนวันนี้</span>
          </div>
        </header>

        <div className="relative pb-8">
          <div className="absolute bottom-10 left-[27px] top-4 w-[3px] rounded-full bg-white/80" />
          <div className="flex flex-col gap-5">
            {CHAPTERS.map((chapter, index) => {
              const kitLocked = !canPlayChapterWithKit(chapter.id, detection);
              const unlocked = isChapterUnlocked(chapter, save, detection);
              const lockHint = chapterLockHint(chapter, save, detection);
              const done = chapter.stages.every((stage) =>
                save.completed.includes(`${chapter.id}-${stage.id}`),
              );
              const playStage = nextPlayableInChapter(chapter, save, detection);
              const href = unlocked
                ? withTouchInput(`/play?chapter=${chapter.id}&stage=${playStage}`, allowTouch)
                : null;
              const icon = GAME_ICONS[chapter.id];

              return (
                <article
                  key={chapter.id}
                  onClick={() => {
                    if (kitLocked) openGuide(chapter.id);
                  }}
                  className={`relative rounded-[2rem] border-4 p-5 pl-16 shadow-xl transition-all duration-300 sm:pl-[4.5rem] ${
                    unlocked
                      ? "border-transparent bg-white hover:border-blue-200 hover:shadow-2xl"
                      : kitLocked
                        ? "cursor-pointer border-sky-200 bg-white hover:border-sky-300"
                        : "cursor-default border-transparent bg-white/80"
                  }`}
                >
                  <div
                    className={`absolute left-[14px] top-5 flex h-[28px] w-[28px] items-center justify-center rounded-full text-[13px] font-bold ${
                      done
                        ? "bg-emerald-500 text-white"
                        : unlocked
                          ? "bg-blue-500 text-white"
                          : kitLocked
                            ? "bg-sky-500 text-white"
                            : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {done ? "✓" : index + 1}
                  </div>

                  <div className="flex gap-4">
                    <div
                      className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl shadow-md sm:h-20 sm:w-20 ${
                        unlocked || kitLocked ? "" : "opacity-50 grayscale"
                      }`}
                    >
                      <img
                        src={icon.src}
                        alt={icon.alt}
                        width={80}
                        height={80}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {chapter.title}
                      </div>
                      <h2 className="text-xl font-black tracking-tight text-slate-800 sm:text-2xl">
                        {chapter.titleEn}
                      </h2>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">{chapter.blurb}</p>
                    </div>
                  </div>

                  {kitLocked ? (
                    <div className="mt-3">
                      <p className="text-sm font-semibold text-sky-700">
                        {lockHint || "ต้องเชื่อมเซนเซอร์ก่อน"}
                      </p>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openGuide(chapter.id);
                        }}
                        className="mt-2 inline-flex min-h-11 items-center rounded-full bg-sky-50 px-4 text-sm font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                      >
                        ดูตำแหน่งเซนเซอร์
                      </button>
                    </div>
                  ) : !unlocked ? (
                    <p className="mt-3 text-sm font-semibold text-amber-600">
                      🔒 {lockHint || chapter.unlockHint}
                    </p>
                  ) : (
                    <>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {chapter.stages.map((stage) => {
                          const open = isStageUnlocked(chapter, stage, save, detection);
                          const cleared = save.completed.includes(`${chapter.id}-${stage.id}`);
                          const pill =
                            "inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold leading-none";
                          if (!open) {
                            return (
                              <span
                                key={stage.id}
                                className={`${pill} bg-slate-100 text-slate-400`}
                              >
                                ด่าน {stage.id} ล็อก
                              </span>
                            );
                          }
                          return (
                            <Link
                              key={stage.id}
                              to={withTouchInput(`/play?chapter=${chapter.id}&stage=${stage.id}`, allowTouch)}
                              onPointerDown={() => primeGameAudio()}
                              onClick={() => primeGameAudio()}
                              className={`${pill} ${
                                cleared
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-sky-50 text-sky-700"
                              }`}
                            >
                              ด่าน {stage.id} {cleared ? "✓" : stage.name}
                            </Link>
                          );
                        })}
                      </div>
                      {href ? (
                        <Link
                          to={href}
                          onPointerDown={() => primeGameAudio()}
                          onClick={() => primeGameAudio()}
                          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-600"
                        >
                          {done ? "เล่นอีกครั้ง" : "เดินทางต่อ"}
                        </Link>
                      ) : null}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {nextReady ? (
          <Link
            to={continueHref}
            onPointerDown={() => primeGameAudio()}
            onClick={() => primeGameAudio()}
            className="mb-8 flex h-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-xl hover:bg-blue-700"
          >
            เริ่มเดิน
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => openGuide(next.chapter)}
            className="mb-8 flex h-14 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-xl hover:bg-blue-700"
          >
            เริ่มเดิน
          </button>
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        muted={muted}
        character={character}
        onClose={() => setSettingsOpen(false)}
        onMutedChange={(next) => {
          setMuted(next);
          writeSettings({ muted: next });
        }}
        onCharacterChange={(id) => {
          setCharacter(id);
          writeSettings({ character: id });
        }}
        showTestKit={allowTouch}
        testKit={testKit}
        onTestKitChange={(kit) => {
          setTestKit(kit);
          writeSettings({ testKit: kit });
        }}
      />
      <SensorPlacementSheet
        open={Boolean(guide)}
        title={guide?.title}
        note={guide?.note}
        images={guide?.images}
        onConnect={() => navigate("/device-connection", { state: { returnTo: "/map" } })}
        onClose={() => setGuide(null)}
      />
    </div>
  );
}
