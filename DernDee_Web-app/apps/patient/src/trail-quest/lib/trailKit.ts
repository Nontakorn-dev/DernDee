export type TrailKit = "ankle" | "full";
export type TrailKitDetection = "none" | "knee" | "ankle" | "full";

export function isTrailKit(value: unknown): value is TrailKit {
  return value === "ankle" || value === "full";
}

export function detectTrailKit(hasAnkle: boolean, hasKnee: boolean): TrailKitDetection {
  if (hasAnkle && hasKnee) return "full";
  if (hasAnkle) return "ankle";
  if (hasKnee) return "knee";
  return "none";
}

export function isPlayableTrailKit(detection: TrailKitDetection): detection is TrailKit {
  return detection === "ankle" || detection === "full";
}

export function kitFromBleDevices(devices: Array<{ positionId?: string; status?: string }> = []) {
  const connected = devices.filter((device) => device.status === "connected");
  const has = (positionId: string) => connected.some((device) => device.positionId === positionId);
  const hasAnkle =
    (has("LEFT_SHANK") && has("LEFT_FOOT"))
    || (has("RIGHT_SHANK") && has("RIGHT_FOOT"));
  const hasKnee =
    (has("LEFT_THIGH") && has("LEFT_SHANK"))
    || (has("RIGHT_THIGH") && has("RIGHT_SHANK"));
  return detectTrailKit(hasAnkle, hasKnee);
}

export function isTrailQuestReady(devices: Array<{ positionId?: string; status?: string }> = []) {
  return kitFromBleDevices(devices) !== "none";
}

export function canPlayChapterWithKit(
  chapterId: string,
  detection: TrailKitDetection | "unknown",
) {
  if (detection === "unknown") return true;
  if (detection === "none") return false;
  if (chapterId === "hip-flexor") return detection === "knee" || detection === "full";
  if (chapterId === "combined") return detection === "ankle" || detection === "full";
  if (chapterId === "dorsiflexor" || chapterId === "plantarflexor") {
    return detection === "ankle" || detection === "full";
  }
  return true;
}
