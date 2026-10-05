import { ClinicalSession } from "@trail/components/clinical/ClinicalSession";
import { clinicalMenuPath } from "@trail/lib/clinicalExercise.js";
import { CHAPTERS, getChapter, type MovementKind } from "@trail/lib/progression";
import { isTouchInputParam } from "@trail/lib/sensorInput";
import { Navigate, useSearchParams } from "react-router-dom";
import { useUserAuth } from "@shared/context/UserAuthContext.jsx";

function isChapter(value: string | null): value is MovementKind {
  return CHAPTERS.some((chapter) => chapter.id === value);
}

export function ClinicalPlay() {
  const { user } = useUserAuth();
  const patientId = user?.uid || "local";
  const [params] = useSearchParams();
  const rawChapter = params.get("chapter");

  if (!isChapter(rawChapter)) {
    return <Navigate to={clinicalMenuPath(params.toString())} replace />;
  }

  const chapter = getChapter(rawChapter);
  const rawStage = Number(params.get("stage") ?? "1");
  const stage = Number.isFinite(rawStage)
    ? Math.min(chapter.stages.length, Math.max(1, rawStage))
    : 1;

  return (
    <ClinicalSession
      key={`${patientId}-${rawChapter}-${stage}-${isTouchInputParam(params) ? "touch" : "sensor"}`}
      chapterId={rawChapter}
      stageId={stage}
      allowTouch={isTouchInputParam(params)}
    />
  );
}
