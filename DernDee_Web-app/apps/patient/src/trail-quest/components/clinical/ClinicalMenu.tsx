import { ClinicalFrame } from "@trail/components/clinical/ClinicalFrame";
import {
  CLINICAL_EXERCISES,
  animatedTrailPath,
  clinicalPlayPath,
} from "@trail/lib/clinicalExercise.js";
import { getChapter } from "@trail/lib/progression";
import { Link, useSearchParams } from "react-router-dom";

export function ClinicalMenu() {
  const [params] = useSearchParams();
  const search = params.toString();

  return (
    <ClinicalFrame backHref={animatedTrailPath(search)}>
      <div className="px-1 pt-2 md:pt-4">
        <h1 className="text-[1.85rem] font-bold leading-tight text-[#1e3344] md:text-4xl">แบบฝึกเดิน</h1>
        <p className="mt-1 max-w-2xl text-base leading-relaxed text-[#5d7384] md:text-lg">
          เลือกท่า แล้วทำตามคำบนหน้าจอ
        </p>
      </div>

      <ol className="mt-5 grid flex-1 grid-cols-1 gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
        {CLINICAL_EXERCISES.map((exercise) => {
          const chapter = getChapter(exercise.id);
          return (
            <li key={exercise.id} className="flex flex-col rounded-[28px] bg-white px-5 py-4 shadow-[0_10px_28px_rgba(80,140,180,0.12)] md:px-6 md:py-5">
              <p className="text-xs font-bold tracking-[0.16em] text-[#8aa0b0]">ท่าที่ {exercise.order}</p>
              <h2 className="mt-1 text-[1.55rem] font-bold leading-tight text-[#1e3344]">{exercise.title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-[#5d7384]">{exercise.summary}</p>
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
