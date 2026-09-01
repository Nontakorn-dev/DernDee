import { GameScreen } from "@trail/components/game/GameScreen";
import { releaseGameMedia } from "@trail/lib/game/assets";
import { CHAPTERS, getChapter, type MovementKind } from "@trail/lib/progression";
import { isTouchInputParam, withTouchInput } from "@trail/lib/sensorInput";
import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

function isChapter(value: string | null): value is MovementKind {
  return CHAPTERS.some((c) => c.id === value);
}

export function PlayClient() {
  const [params] = useSearchParams();
  const rawChapter = params.get("chapter");
  const validChapter = isChapter(rawChapter);

  useEffect(() => {
    if (!validChapter) return undefined;
    return () => {
      releaseGameMedia();
    };
  }, [validChapter]);

  if (!validChapter) {
    return <Navigate to={withTouchInput("/map", isTouchInputParam(params))} replace />;
  }
  const chapter = rawChapter;
  const rawStage = Number(params.get("stage") ?? "1");
  const max = getChapter(chapter).stages.length;
  const stage = Number.isFinite(rawStage) ? Math.min(max, Math.max(1, rawStage)) : 1;
  const allowTouch = isTouchInputParam(params);

  return (
    <GameScreen
      key={`${chapter}-${stage}-${allowTouch ? "touch" : "sensor"}`}
      chapterId={chapter}
      stageId={stage}
      allowTouch={allowTouch}
    />
  );
}
