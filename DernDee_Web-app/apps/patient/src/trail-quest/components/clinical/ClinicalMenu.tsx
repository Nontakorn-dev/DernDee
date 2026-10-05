import { ClinicalFrame } from "@trail/components/clinical/ClinicalFrame";
import { TrailSettingsButton } from "@trail/components/game/SettingsModal";
import {
  CLINICAL_EXERCISES,
  animatedTrailPath,
  clinicalPlayPath,
} from "@trail/lib/clinicalExercise.js";
import { getChapter } from "@trail/lib/progression";
import { isTouchInputParam } from "@trail/lib/sensorInput";
import { Link, useSearchParams } from "react-router-dom";

export function ClinicalMenu() {
  const [params] = useSearchParams();
  const search = params.toString();

  return (
    <ClinicalFrame
      backHref={animatedTrailPath(search)}
      actions={<TrailSettingsButton showTestKit={isTouchInputParam(params)} />}
    >
      <div className="px-1 pt-2 md:pt-4">
        <h1 className="text-3xl font-black leading-tight text-gray-800 md:text-4xl">แบบฝึกเดิน</h1>
        <p className="mt-1 max-w-2xl text-base leading-relaxed text-gray-500 md:text-lg">
          เลือกท่า แล้วทำตามคำบนหน้าจอ
        </p>
      </div>

      <ol className="mt-5 grid flex-1 grid-cols-1 gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
        {CLINICAL_EXERCISES.map((exercise) => {
          const chapter = getChapter(exercise.id);
          return (
            <li key={exercise.id} className="flex flex-col rounded-[2rem] bg-white px-5 py-5 shadow-xl md:px-6 md:py-6">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">ท่าที่ {exercise.order}</p>
              <h2 className="mt-1 text-2xl font-black leading-tight text-gray-800">{exercise.title}</h2>
              <p className="mt-1 text-base leading-relaxed text-gray-500">{exercise.summary}</p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <Link
                  to={clinicalPlayPath(exercise.id, 1, search)}
                  className="inline-flex h-12 items-center rounded-2xl bg-[#2f6fed] px-5 text-base font-bold text-white shadow-[0_8px_16px_rgba(47,111,237,0.25)]"
                >
                  เริ่มท่านี้
                </Link>
                {chapter.stages.slice(1).map((stage) => (
                  <Link
                    key={stage.id}
                    to={clinicalPlayPath(exercise.id, stage.id, search)}
                    className="inline-flex h-12 items-center rounded-2xl bg-[#eef5fb] px-4 text-sm font-bold text-[#3d5f86]"
                  >
                    ระดับ {stage.id} · {stage.targetAngle}°
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </ClinicalFrame>
  );
}
