import { AnkleAngleEstimator } from "@shared/gait/ankleAngleEstimator.js";
import {
  resolveActiveAnklePairs,
  resolveActiveLegPairs,
} from "@shared/gait/gaitSensorSelection.js";
import { KneeAngleEstimator } from "@shared/gait/kneeAngleEstimator.js";
import {
  autoConnectBrowserBleDevices,
  createRealtimeConnection,
} from "@shared/gateway/realtimeTransport.js";
import { normalizeRealtimeSensorSample } from "@shared/gateway/realtimeSensorUtils.js";
import type { HazardKind } from "@trail/lib/game/types";
import type { MovementKind } from "@trail/lib/progression";
import {
  chapterNeedsAnklePair,
  chapterNeedsKneePair,
  jointInputFor,
  jointLabelFor,
  sensorRequirementCopy,
  sideLabelFor,
  type JointInput,
} from "@trail/lib/sensorInput";
import { detectTrailKit, type TrailKitDetection } from "@trail/lib/trailKit";
import { useCallback, useEffect, useRef, useState } from "react";

const SENSOR_STALE_AFTER_MS = 2500;

type SensorRuntime = {
  sensorKey: string;
  side: string | null;
  sensorMount: string;
  lastSeenAt: number;
};

type GateStatus = "missing" | "calibrate" | "live" | "blocked";

function createSensorRuntime(sample: {
  sensorKey: string;
  side?: string | null;
  sensorMount?: string | null;
}): SensorRuntime {
  return {
    sensorKey: sample.sensorKey,
    side: sample.side || null,
    sensorMount: sample.sensorMount || "unknown",
    lastSeenAt: Date.now(),
  };
}

export function useTrailQuestSensors({
  enabled,
  chapter,
  hazardKind,
  onAngle,
}: {
  enabled: boolean;
  chapter: MovementKind;
  hazardKind: HazardKind | null;
  onAngle: (deg: number | null) => void;
}) {
  const [status, setStatus] = useState<GateStatus>("missing");
  const [sideLabel, setSideLabel] = useState("—");
  const [jointLabel, setJointLabel] = useState(jointLabelFor(jointInputFor(chapter, hazardKind)));
  const [calibrateError, setCalibrateError] = useState("");
  const [angle, setAngle] = useState(0);
  const [detection, setDetection] = useState<TrailKitDetection>("none");

  const onAngleRef = useRef(onAngle);
  onAngleRef.current = onAngle;
  const chapterRef = useRef(chapter);
  chapterRef.current = chapter;
  const hazardKindRef = useRef(hazardKind);
  hazardKindRef.current = hazardKind;

  const sensorRuntimesRef = useRef(new Map<string, SensorRuntime>());
  const ankleEstimatorsRef = useRef(new Map<string, AnkleAngleEstimator>());
  const kneeEstimatorsRef = useRef(new Map<string, KneeAngleEstimator>());
  const calibratedRef = useRef(false);
  const lastUiAtRef = useRef(0);
  const lastDegRef = useRef(0);
  const preferredAnkleSideRef = useRef<string | null>(null);
  const preferredKneeSideRef = useRef<string | null>(null);

  const copy = sensorRequirementCopy(chapter, detection);

  const getAnkleEstimator = useCallback((side: string) => {
    const current = ankleEstimatorsRef.current.get(side);
    if (current) return current;
    const created = new AnkleAngleEstimator();
    ankleEstimatorsRef.current.set(side, created);
    return created;
  }, []);

  const getKneeEstimator = useCallback((side: string) => {
    const current = kneeEstimatorsRef.current.get(side);
    if (current) return current;
    const created = new KneeAngleEstimator({ autoPolarity: true });
    kneeEstimatorsRef.current.set(side, created);
    return created;
  }, []);

  const publish = useCallback((nextAngle: number | null, nextStatus: GateStatus, side: string | null, input: JointInput, nextDetection: TrailKitDetection) => {
    onAngleRef.current(nextStatus === "live" ? nextAngle : null);
    setStatus(nextStatus);
    setDetection(nextDetection);
    const now = Date.now();
    if (now - lastUiAtRef.current < 80) return;
    lastUiAtRef.current = now;
    setJointLabel(jointLabelFor(input));
    setSideLabel(sideLabelFor(side));
    if (Number.isFinite(nextAngle)) setAngle(nextAngle as number);
  }, []);

  const resolveStatus = useCallback((input: JointInput) => {
    const sensors = Array.from(sensorRuntimesRef.current.values());
    const needAnkle = chapterNeedsAnklePair(chapterRef.current);
    const needKnee = chapterNeedsKneePair(chapterRef.current);
    const anklePairs = resolveActiveAnklePairs(sensors, { staleAfterMs: SENSOR_STALE_AFTER_MS });
    const kneePairs = resolveActiveLegPairs(sensors, { staleAfterMs: SENSOR_STALE_AFTER_MS });
    const nextDetection = detectTrailKit(anklePairs.length > 0, kneePairs.length > 0);

    if (chapterRef.current === "combined" && nextDetection === "knee") {
      return { nextStatus: "blocked" as const, side: null, deg: null, anklePairs, kneePairs, nextDetection };
    }

    const hasAnkle = !needAnkle || anklePairs.length > 0;
    const hasKnee = !needKnee || kneePairs.length > 0;

    if (!hasAnkle || !hasKnee) {
      return { nextStatus: "missing" as const, side: null, deg: null, anklePairs, kneePairs, nextDetection };
    }

    if (!calibratedRef.current) {
      return { nextStatus: "calibrate" as const, side: null, deg: null, anklePairs, kneePairs, nextDetection };
    }

    let side: string | null = null;
    let deg: number | null = null;
    if (input === "kneeFlexion") {
      const pair =
        kneePairs.find((item) => item.side === preferredKneeSideRef.current) || kneePairs[0];
      if (pair) {
        preferredKneeSideRef.current = pair.side;
        side = pair.side;
        deg = getKneeEstimator(pair.side).getFlexionDeg();
      }
    } else {
      const pair =
        anklePairs.find((item) => item.side === preferredAnkleSideRef.current) || anklePairs[0];
      if (pair) {
        preferredAnkleSideRef.current = pair.side;
        side = pair.side;
        deg = getAnkleEstimator(pair.side).getDirectedDeg(input);
      }
    }

    if (Number.isFinite(deg)) {
      lastDegRef.current = deg as number;
    } else {
      deg = lastDegRef.current;
    }

    return { nextStatus: "live" as const, side, deg, anklePairs, kneePairs, nextDetection };
  }, [getAnkleEstimator, getKneeEstimator]);

  const ingestSample = useCallback((msg: { type?: string; payload?: unknown }) => {
    if (!enabled || msg.type !== "DATA") return;
    const sample = normalizeRealtimeSensorSample(msg.payload || {});
    if (!sample || !sample.side) return;

    const now = Date.now();
    let sensorState = sensorRuntimesRef.current.get(sample.sensorKey);
    if (!sensorState) {
      sensorState = createSensorRuntime(sample);
      sensorRuntimesRef.current.set(sample.sensorKey, sensorState);
    }
    sensorState.side = sample.side || sensorState.side;
    sensorState.sensorMount = sample.sensorMount || sensorState.sensorMount;
    sensorState.lastSeenAt = now;

    const trackerSample = {
      ...sample,
      timestampMs: sample.timestampMs ?? sample.timestamp_ms ?? now,
    };

    if (sample.sensorMount === "shank") {
      getAnkleEstimator(sample.side).updateShank(trackerSample);
      getKneeEstimator(sample.side).updateShank(trackerSample);
    } else if (sample.sensorMount === "foot") {
      getAnkleEstimator(sample.side).updateFoot(trackerSample);
    } else if (sample.sensorMount === "thigh") {
      getKneeEstimator(sample.side).updateThigh(trackerSample);
    }

    const input = jointInputFor(chapterRef.current, hazardKindRef.current);
    const resolved = resolveStatus(input);
    publish(resolved.deg, resolved.nextStatus, resolved.side, input, resolved.nextDetection);
  }, [enabled, getAnkleEstimator, getKneeEstimator, publish, resolveStatus]);

  const ingestSampleRef = useRef(ingestSample);
  ingestSampleRef.current = ingestSample;

  const calibrate = useCallback(() => {
    setCalibrateError("");
    const input = jointInputFor(chapterRef.current, hazardKindRef.current);
    const sensors = Array.from(sensorRuntimesRef.current.values());
    const anklePairs = resolveActiveAnklePairs(sensors, { staleAfterMs: SENSOR_STALE_AFTER_MS });
    const kneePairs = resolveActiveLegPairs(sensors, { staleAfterMs: SENSOR_STALE_AFTER_MS });
    const needAnkle = chapterNeedsAnklePair(chapterRef.current);
    const needKnee = chapterNeedsKneePair(chapterRef.current);

    let ok = true;
    if (needAnkle) {
      if (anklePairs.length === 0) ok = false;
      for (const pair of anklePairs) {
        if (!getAnkleEstimator(pair.side).calibrateToCurrentPose()) ok = false;
      }
    }
    if (needKnee || (chapterRef.current === "combined" && kneePairs.length > 0)) {
      if (needKnee && kneePairs.length === 0) ok = false;
      for (const pair of kneePairs) {
        if (!getKneeEstimator(pair.side).calibrateToCurrentPose()) ok = false;
      }
    }

    const nextDetection = detectTrailKit(anklePairs.length > 0, kneePairs.length > 0);
    if (!ok) {
      setCalibrateError("ยังอ่านมุมจากเซนเซอร์ไม่ครบ ยืนนิ่งแล้วลองอีกครั้ง");
      calibratedRef.current = false;
      publish(null, "calibrate", null, input, nextDetection);
      return { ok: false, detection: nextDetection };
    }

    calibratedRef.current = true;
    const resolved = resolveStatus(input);
    publish(resolved.deg ?? 0, "live", resolved.side, input, resolved.nextDetection);
    return { ok: true, detection: resolved.nextDetection };
  }, [getAnkleEstimator, getKneeEstimator, publish, resolveStatus]);

  useEffect(() => {
    if (!enabled) {
      onAngleRef.current(null);
      setStatus("missing");
      calibratedRef.current = false;
      return undefined;
    }

    calibratedRef.current = false;
    lastDegRef.current = 0;
    sensorRuntimesRef.current.clear();
    ankleEstimatorsRef.current.clear();
    kneeEstimatorsRef.current.clear();
    setStatus("missing");
    setCalibrateError("");
    onAngleRef.current(null);

    let closed = false;
    let socket: ReturnType<typeof createRealtimeConnection> | null = null;
    const connect = () => {
      if (closed) return;
      socket = createRealtimeConnection();
      socket.onmessage = (event: { data: string }) => {
        try {
          ingestSampleRef.current(JSON.parse(event.data));
        } catch {
          // Ignore non-JSON frames.
        }
      };
      socket.onclose = () => {
        if (!closed) window.setTimeout(connect, 2500);
      };
    };

    connect();
    void autoConnectBrowserBleDevices().catch(() => {});

    const prune = window.setInterval(() => {
      const input = jointInputFor(chapterRef.current, hazardKindRef.current);
      const resolved = resolveStatus(input);
      publish(resolved.deg, resolved.nextStatus, resolved.side, input, resolved.nextDetection);
    }, 400);

    return () => {
      closed = true;
      window.clearInterval(prune);
      socket?.close();
      onAngleRef.current(null);
    };
  }, [chapter, enabled, publish, resolveStatus]);

  return {
    ready: enabled && status === "live",
    status: enabled ? status : "live",
    detection,
    copy,
    sideLabel,
    jointLabel,
    angle,
    calibrateError,
    calibrate,
  };
}
