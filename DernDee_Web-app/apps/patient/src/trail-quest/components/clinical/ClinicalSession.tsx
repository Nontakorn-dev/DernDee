import { SensorGate } from "@trail/components/game/SensorGate";
import { formatClock, gaugeCeiling } from "@trail/components/clinical/ClinicalFrame";
import { useTrailQuestSensors } from "@trail/hooks/useTrailQuestSensors";
import {
  POSE_COPY,
  clinicalMenuPath,
  createClinicalSession,
  poseSequence,
  tickClinical,
} from "@trail/lib/clinicalExercise.js";
import { getStage, type MovementKind } from "@trail/lib/progression";
import { loadSettings } from "@trail/lib/settings";
import { trailGuidesForChapter } from "@shared/sensors/sensorPlacementGuides.js";
import stepdeeLogo from "@shared/assets/images/stepdee-logo.png";
import { ArrowLeft, Pause, Play, Square } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { HazardKind } from "@trail/lib/game/types";
import type { TrailKit } from "@trail/lib/trailKit";

export function ClinicalSession({
  chapterId,
  stageId,
  allowTouch,
}: {
  chapterId: MovementKind;
  stageId: number;
  allowTouch: boolean;
}) {
  const navigate = useNavigate();
  const stage = getStage(chapterId, stageId);
  const guide = trailGuidesForChapter(chapterId);
  const [params] = useSearchParams();
  const menuHref = clinicalMenuPath(params.toString());
  const [sensorKit, setSensorKit] = useState<TrailKit | null>(allowTouch ? loadSettings().testKit : null);
  const kit: TrailKit = allowTouch ? loadSettings().testKit : sensorKit ?? "full";
  const poses = poseSequence(chapterId, stage.gaps, kit) as HazardKind[];
  const poseKey = poses.join(",");
  const [session, setSession] = useState(() =>
    createClinicalSession({
      targetAngle: stage.targetAngle,
      walkSeconds: stage.runSeconds,
      poses,
    }),
  );
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const holdingRef = useRef(false);
  const pausedRef = useRef(false);
  const liveAngleRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const phaseRef = useRef(session.phase);
  phaseRef.current = session.phase;

  const pose = (session.poses[session.index] || session.poses[0] || "duck") as HazardKind;
  const copy = POSE_COPY[pose] || POSE_COPY.duck;
  const sensors = useTrailQuestSensors({
    enabled: !allowTouch,
    chapter: chapterId,
    hazardKind: pose,
    onAngle: (deg) => {
      liveAngleRef.current = deg;
    },
  });

  useEffect(() => {
    holdingRef.current = false;
    pausedRef.current = false;
    elapsedRef.current = 0;
    liveAngleRef.current = null;
    setPaused(false);
    setElapsed(0);
    setSession(createClinicalSession({
      targetAngle: stage.targetAngle,
      walkSeconds: stage.runSeconds,
      poses: poseSequence(chapterId, stage.gaps, kit),
    }));
  }, [chapterId, kit, poseKey, stage.gaps, stage.runSeconds, stage.targetAngle]);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const loop = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!pausedRef.current && phaseRef.current !== "done") {
        elapsedRef.current += dt;
        setElapsed(elapsedRef.current);
        setSession((current) => {
          if (current.phase === "done") return current;
          return tickClinical(current, dt, {
            mode: allowTouch ? "hold" : "live",
            holding: holdingRef.current,
            liveAngle: liveAngleRef.current,
          });
        });
      }
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [allowTouch]);

  const ceiling = gaugeCeiling(session.targetAngle);
  const ratio = Math.max(0, Math.min(1, session.angle / Math.max(1, session.targetAngle)));
  const fill = Math.max(0, Math.min(100, (session.angle / ceiling) * 100));
  const targetLine = Math.max(0, Math.min(100, (session.targetAngle / ceiling) * 100));
  const ticks = Array.from({ length: ceiling / 5 + 1 }, (_, index) => index * 5);
  const walking = session.phase === "walk";
  const done = session.phase === "done";
  const finishedReps = done
    ? session.poses.length
    : walking
      ? session.index + 1
      : session.index;
  const progress = Math.min(
    1,
    (finishedReps + (session.phase === "hold" ? ratio : 0)) / session.poses.length,
  );
  const shownReps = done ? session.poses.length : Math.min(session.poses.length, finishedReps + (walking ? 0 : 1));
  const gaugeState = ratio >= 1 ? "success" : ratio >= 0.5 ? "approaching" : "idle";
  const fillClass = gaugeState === "success"
    ? "bg-emerald-500"
    : gaugeState === "approaching"
      ? "bg-amber-400"
      : "bg-blue-400";
  const numberClass = gaugeState === "success"
    ? "text-emerald-500"
    : gaugeState === "approaching"
      ? "text-amber-500"
      : "text-blue-500";
  const status = done
    ? "ครบตามจำนวนแล้ว"
    : paused
      ? "พักอยู่"
      : walking
        ? "เดินตามปกติ"
        : copy.action;

  const press = (event: PointerEvent<HTMLElement>) => {
    if (!allowTouch || walking || done || pausedRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    holdingRef.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointerup still ends the hold.
    }
  };

  const release = () => {
    holdingRef.current = false;
  };

  const togglePause = () => {
    if (done) return;
    setPaused((current) => {
      pausedRef.current = !current;
      if (!current) release();
      return !current;
    });
  };

  const restart = () => {
    holdingRef.current = false;
    pausedRef.current = false;
    elapsedRef.current = 0;
    setPaused(false);
    setElapsed(0);
    setSession(createClinicalSession({
      targetAngle: stage.targetAngle,
      walkSeconds: stage.runSeconds,
      poses,
    }));
  };

  return (
    <div
      className="flex min-h-dvh flex-col bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 text-gray-800"
      style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
    >
      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-xl sm:px-6 sm:py-4 lg:px-12">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(menuHref)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            aria-label="กลับ"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <img src={stepdeeLogo} alt="StepDee" className="h-10 object-contain sm:h-12" />
        </div>
        <div className="w-11" />
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-center gap-6 p-4 lg:grid-cols-2 lg:gap-16 lg:p-12">
        <h1 className="text-center text-2xl font-extrabold text-gray-800 sm:text-3xl md:hidden">{status}</h1>
        <div
          className={`relative flex h-[55vh] min-h-[380px] items-end justify-center touch-none select-none lg:h-[70vh] lg:min-h-[500px] ${paused ? "opacity-70" : ""}`}
          role="button"
          aria-label={copy.action}
          tabIndex={0}
          onPointerDown={press}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <div className="relative mx-auto flex h-full w-full max-w-sm justify-center">
            <div className="absolute bottom-0 left-0 top-0 flex flex-col justify-between py-4 text-sm font-bold text-gray-400">
              {ticks.slice().reverse().map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>

            <div className={`relative ml-12 h-full w-32 overflow-hidden rounded-full border-8 border-white bg-gray-100/50 shadow-2xl lg:w-40 ${
              gaugeState === "success" ? "shadow-[0_0_30px_rgba(16,185,129,0.6)]" : ""
            }`}
            >
              <div
                className="absolute inset-0 opacity-10"
                style={{ backgroundImage: "linear-gradient(#000 1px, transparent 1px)", backgroundSize: "100% 10%" }}
              />
              <div
                className="absolute left-0 right-0 z-20 border-t-4 border-dashed border-red-500"
                style={{ bottom: `${targetLine}%` }}
              />
              <div
                className={`absolute bottom-0 left-0 right-0 transition-all duration-150 ease-out ${fillClass}`}
                style={{ height: `${fill}%` }}
              >
                <div className="absolute left-0 right-0 top-0 h-2 bg-white/30" />
              </div>
              <div className="absolute left-2 top-0 z-30 h-[90%] w-4 rounded-full bg-gradient-to-r from-white/40 to-transparent" />
            </div>

            <div className="absolute right-0 top-1/2 z-40 -translate-y-1/2 lg:-right-12">
              <div className={`flex flex-col items-center justify-center rounded-3xl border-2 bg-white p-4 shadow-xl ${
                gaugeState === "success" ? "border-emerald-400" : "border-white"
              }`}
              >
                <div className="mb-1 text-center text-sm font-bold uppercase tracking-wide text-gray-400">มุมขณะนี้</div>
                <div className={`flex items-start justify-center text-5xl font-black tabular-nums leading-none ${numberClass}`}>
                  {Math.round(session.angle)}
                  <span className="mt-1 text-2xl font-black">°</span>
                </div>
                <div className="mt-1 text-sm font-bold text-gray-400">เป้าหมาย {session.targetAngle}°</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-6">
          <h1 className="hidden text-3xl font-extrabold text-gray-800 md:block">{status}</h1>
          <section className="rounded-[2rem] bg-white p-6 shadow-xl lg:p-8">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <div className="text-sm font-bold uppercase tracking-widest text-gray-400">เวลา</div>
                <div className="text-4xl font-black tabular-nums text-gray-800 lg:text-6xl">{formatClock(elapsed)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold uppercase tracking-widest text-gray-400">ความคืบหน้า</div>
                <div className="text-3xl font-black text-blue-600 lg:text-4xl">
                  {shownReps}<span className="text-2xl text-gray-300"> / {session.poses.length}</span>
                </div>
              </div>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500 ease-out"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            {!allowTouch && sensors.ready ? (
              <p className="mt-3 text-center text-sm font-bold text-gray-400">{sensors.jointLabel} · {sensors.sideLabel}</p>
            ) : null}
          </section>

          <div className="grid grid-cols-2 gap-4">
            {done ? (
              <button
                type="button"
                onClick={restart}
                className="col-span-2 flex items-center justify-center gap-3 rounded-2xl bg-blue-600 py-6 text-xl font-black text-white shadow-xl"
              >
                <Play className="h-8 w-8" />
                ทำอีกครั้ง
              </button>
            ) : (
              <button
                type="button"
                onClick={togglePause}
                className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400 py-6 text-xl font-bold text-white shadow-lg"
              >
                {paused ? <Play className="h-6 w-6" /> : <Pause className="h-6 w-6" />}
                {paused ? "เดินต่อ" : "พัก"}
              </button>
            )}
            {!done ? (
              <button
                type="button"
                onClick={() => navigate(menuHref)}
                className="flex items-center justify-center gap-2 rounded-2xl bg-red-500 py-6 text-xl font-bold text-white shadow-lg"
              >
                <Square className="h-6 w-6" />
                หยุด
              </button>
            ) : null}
          </div>
        </div>
      </main>

      <SensorGate
        title={sensors.copy.title}
        body={sensors.copy.body}
        missing={sensors.copy.missing}
        status={allowTouch ? "live" : sensors.status}
        error={sensors.calibrateError}
        images={guide.images}
        note={guide.note || guide.body}
        blockedHref={menuHref}
        blockedCta="กลับไปเลือกท่า"
        onCalibrate={() => {
          const result = sensors.calibrate();
          if (
            chapterId === "combined"
            && result.ok
            && (result.detection === "ankle" || result.detection === "full")
          ) {
            setSensorKit(result.detection);
          }
        }}
      />
    </div>
  );
}
