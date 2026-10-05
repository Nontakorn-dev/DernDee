import { SensorGate } from "@trail/components/game/SensorGate";
import { ClinicalFrame, formatClock, gaugeCeiling } from "@trail/components/clinical/ClinicalFrame";
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
    <ClinicalFrame backHref={menuHref}>
      <div className="flex flex-1 flex-col md:grid md:grid-cols-[minmax(240px,340px)_minmax(0,1fr)] md:items-center md:gap-x-8 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] lg:gap-x-14">
        <div className="px-1 text-center md:col-start-2 md:row-start-1 md:px-0 md:text-left">
          <p className="text-lg font-bold text-[#1e3344] md:text-3xl">{status}</p>
        </div>

        <div
          className={`relative mx-auto mt-1 h-[300px] w-full max-w-[340px] shrink-0 touch-none select-none md:col-start-1 md:row-span-3 md:row-start-1 md:mx-0 md:h-[min(68vh,560px)] md:max-w-none ${
            paused ? "opacity-70" : ""
          }`}
          role="button"
          aria-label={copy.action}
          tabIndex={0}
          onPointerDown={press}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <div className="absolute bottom-3 left-0 top-3 flex w-8 flex-col justify-between text-right text-[13px] font-semibold text-[#9aafbf] md:w-10 md:text-base">
            {ticks.slice().reverse().map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          <div className="absolute bottom-0 left-8 top-0 w-[112px] md:left-12 md:w-[148px]">
            <div className="relative h-full rounded-full bg-white p-[7px] shadow-[0_16px_40px_rgba(90,150,190,0.28)] md:p-2">
              <div className="relative h-full overflow-hidden rounded-full bg-[#f3f8fc]">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    className="absolute left-3 right-3 border-t border-[#d5e4ee]"
                    style={{ bottom: `${(tick / ceiling) * 100}%` }}
                  />
                ))}
                <div
                  className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#6ec8ea] to-[#e7f7fd] transition-[height] duration-150 ease-out"
                  style={{ height: `${fill}%` }}
                />
                <span
                  className="absolute left-2 right-2 border-t-2 border-dashed border-[#e85d6a]"
                  style={{ bottom: `${targetLine}%` }}
                />
              </div>
            </div>
            <div className="absolute left-[62%] top-1/2 z-10 w-max -translate-y-1/2 rounded-[22px] bg-white px-4 py-3 text-left shadow-[0_14px_32px_rgba(70,120,160,0.18)] md:left-[68%] md:px-5 md:py-4">
              <p className="text-[11px] font-bold tracking-[0.08em] text-[#93a6b4] md:text-xs">มุมขณะนี้</p>
              <p className="mt-0.5 flex items-start leading-none">
                <span className="text-[2.65rem] font-bold tabular-nums text-[#2f6fed] md:text-6xl">{Math.round(session.angle)}</span>
                <span className="mt-1 text-[1.35rem] font-bold leading-none text-[#2f6fed] md:mt-2 md:text-3xl">°</span>
              </p>
              <p className="text-xs font-semibold text-[#8aa0b0] md:text-sm">เป้าหมาย {session.targetAngle}°</p>
            </div>
          </div>
        </div>

        <div className="md:col-start-2 md:row-start-2">
          <section className="mt-3 rounded-[28px] bg-white px-5 py-4 shadow-[0_12px_30px_rgba(80,140,180,0.12)] md:mt-4 md:px-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold tracking-[0.14em] text-[#93a6b4]">เวลา</p>
                <p className="text-[2rem] font-bold leading-none tabular-nums text-[#1e3344] md:text-4xl">{formatClock(elapsed)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold tracking-[0.14em] text-[#93a6b4]">ความคืบหน้า</p>
                <p className="text-[2rem] font-bold leading-none tabular-nums text-[#2f6fed] md:text-4xl">
                  {shownReps}
                  <span className="text-[#c5d0d8]">/{session.poses.length}</span>
                </p>
              </div>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e8eef3]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#3dce9a] transition-[width] duration-150 ease-out"
                style={{ width: `${Math.max(progress > 0 ? 4 : 0, progress * 100)}%` }}
              />
            </div>
            {!allowTouch && sensors.ready ? (
              <p className="mt-1 text-center text-xs text-[#8aa0b0]">{sensors.jointLabel} · {sensors.sideLabel}</p>
            ) : null}
          </section>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {done ? (
              <button
                type="button"
                onClick={restart}
                className="flex h-14 items-center justify-center rounded-2xl bg-[#f6c445] text-base font-extrabold text-[#3c3420] shadow-[0_8px_16px_rgba(214,170,40,0.28)] md:h-16 md:text-lg"
              >
                ทำอีกครั้ง
              </button>
            ) : (
              <button
                type="button"
                onClick={togglePause}
                className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#f6c445] text-base font-extrabold text-[#3c3420] shadow-[0_8px_16px_rgba(214,170,40,0.28)] md:h-16 md:text-lg"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-[#3c3420]">
                  {paused ? (
                    <span className="ml-0.5 border-y-[5px] border-l-[8px] border-y-transparent border-l-[#3c3420]" />
                  ) : (
                    <span className="flex gap-[3px]">
                      <span className="h-3 w-[3px] rounded-sm bg-[#3c3420]" />
                      <span className="h-3 w-[3px] rounded-sm bg-[#3c3420]" />
                    </span>
                  )}
                </span>
                {paused ? "เดินต่อ" : "พัก"}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(menuHref)}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#ef6d64] text-base font-extrabold text-white shadow-[0_8px_16px_rgba(214,80,70,0.28)] md:h-16 md:text-lg"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-white">
                <span className="h-2.5 w-2.5 rounded-[2px] bg-white" />
              </span>
            หยุด
          </button>
          </div>
        </div>
      </div>

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
    </ClinicalFrame>
  );
}
