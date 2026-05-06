import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrientationTracker } from '@shared/sensor/orientationTracker.js';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { createRealtimeConnection } from '@shared/gateway/realtimeTransport.js';
import {
    getRealtimeSensorLabel,
    getRealtimeSensorSideOrder,
    normalizeRealtimeSensorSample,
} from '@shared/gateway/realtimeSensorUtils.js';
import { usePersistedGatewaySession } from '@shared/hooks/usePersistedGatewaySession.js';
import { ArrowLeft, ArrowRight, Settings, Target, Play, Pause, Square, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

// === CONSTANTS ===
const GAME_STATES = {
    CALIBRATING: 'CALIBRATING',
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED'
};

// Zone thresholds (distance from center in %)
const ZONE_A_THRESHOLD = 15; // Perfect (green)
const ZONE_B_THRESHOLD = 35; // Warning (yellow)
// Beyond Zone B = Critical (red)
const MAX_VISIBLE_SENSORS = 2;
const SENSOR_STALE_AFTER_MS = 2500;

// === Quaternion math helpers ===
function quatMultiply(a, b) {
    return [
        a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
        a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
        a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
        a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0]
    ];
}

function quatConjugate(q) {
    return [q[0], -q[1], -q[2], -q[3]];
}

function quatToRotVec(q) {
    let [w, x, y, z] = q;
    if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
    const sinHalf = Math.sqrt(x * x + y * y + z * z);
    if (sinHalf < 1e-6) return [0, 0, 0];
    const scale = 2 * Math.atan2(sinHalf, w) / sinHalf;
    return [x * scale, y * scale, z * scale];
}

function quatAngleDeg(a, b) {
    const delta = quatMultiply(quatConjugate(a), b);
    const w = Math.max(-1, Math.min(1, Math.abs(delta[0])));
    return 2 * Math.acos(w) * 180 / Math.PI;
}

function getDistanceFromCenter(x, y) {
    return Math.sqrt(x * x + y * y);
}

function getZoneForDistance(distance) {
    if (distance <= ZONE_A_THRESHOLD) return 'A';
    if (distance <= ZONE_B_THRESHOLD) return 'B';
    return 'C';
}

function sortSensorStates(left, right) {
    const sideDelta = getRealtimeSensorSideOrder(left?.side) - getRealtimeSensorSideOrder(right?.side);
    if (sideDelta !== 0) {
        return sideDelta;
    }

    return (right?.lastSeenAt || 0) - (left?.lastSeenAt || 0);
}

function createSensorRuntime(sample) {
    return {
        sensorKey: sample.sensorKey,
        label: getRealtimeSensorLabel(sample),
        side: sample.side || null,
        sensorMount: sample.sensorMount || 'unknown',
        lastSeenAt: Date.now(),
        tracker: new OrientationTracker(),
        refQuaternion: null,
        lastQuaternion: null,
        calibrationSamples: [],
        rawRoll: 0,
        rawPitch: 0,
        lastSmoothedRoll: 0,
        lastSmoothedPitch: 0,
        lastSmoothedYaw: 0,
        yawBaseline: 0,
        yawBaselineInit: false,
        displayRoll: 0,
        displayPitch: 0,
        calibratedRoll: 0,
        calibratedPitch: 0,
        bubbleX: 0,
        bubbleY: 0,
        lastDisplayUpdate: 0,
    };
}

function buildSensorView(sensorState) {
    const distanceFromCenter = getDistanceFromCenter(sensorState.bubbleX, sensorState.bubbleY);

    return {
        key: sensorState.sensorKey,
        label: sensorState.label,
        side: sensorState.side,
        sensorMount: sensorState.sensorMount,
        displayRoll: sensorState.displayRoll,
        displayPitch: sensorState.displayPitch,
        calibratedRoll: sensorState.calibratedRoll,
        calibratedPitch: sensorState.calibratedPitch,
        bubbleX: sensorState.bubbleX,
        bubbleY: sensorState.bubbleY,
        distanceFromCenter,
        zone: getZoneForDistance(distanceFromCenter),
    };
}

function resolveVisibleSensorKeys(sensorRuntimeMap) {
    const now = Date.now();
    const activeSensors = Array.from(sensorRuntimeMap.values())
        .filter((sensorState) => now - sensorState.lastSeenAt <= SENSOR_STALE_AFTER_MS)
        .sort(sortSensorStates);

    const shankSensors = activeSensors.filter((sensorState) => sensorState.sensorMount === 'shank');
    const preferredSensors = shankSensors.length > 0 ? shankSensors : activeSensors;

    return preferredSensors.slice(0, shankSensors.length > 0 ? MAX_VISIBLE_SENSORS : 1).map((sensorState) => sensorState.sensorKey);
}

const GameBalance = () => {
    const navigate = useNavigate();
    const { user } = useUserAuth();

    // === Game State ===
    const [gameState, setGameState] = useState(GAME_STATES.CALIBRATING);
    const [showSettings, setShowSettings] = useState(false);
    const [sensitivity, setSensitivity] = useState(1.0); // For display
    const gameStateRef = useRef(GAME_STATES.CALIBRATING);

    // === Calibration Offsets (use refs so callback always gets latest) ===
    const offsetRollRef = useRef(0);
    const offsetPitchRef = useRef(0);
    const [offsetRoll, setOffsetRoll] = useState(0); // For display only
    const [offsetPitch, setOffsetPitch] = useState(0); // For display only
    const [isCalibrating, setIsCalibrating] = useState(false);
    const isCalibratingRef = useRef(false); // Ref for callback
    const sensitivityRef = useRef(1.0);

    // === Real-time Sensor Data ===
    const [sensorViews, setSensorViews] = useState([]);

    // === Metrics ===
    const [timeInZone, setTimeInZone] = useState(0); // seconds in green zone
    const [zoneStats, setZoneStats] = useState({ A: 0, B: 0, C: 0 }); // Time in each zone
    const [avgDeviation, setAvgDeviation] = useState(0); // average angle deviation
    const [sessionTime, setSessionTime] = useState(0);
    const deviationHistoryRef = useRef([]);
    const [isConnected, setIsConnected] = useState(false);
    const [sessionMetrics, setSessionMetrics] = useState({});

    // === WebSocket ===
    const wsRef = useRef(null);
    const timerRef = useRef(null);
    const zoneTimerRef = useRef(null);
    const manualDisconnectRef = useRef(false);
    const sensorRuntimesRef = useRef(new Map());
    const activeSensorKeysRef = useRef([]);

    // === Computed Values ===
    const controlSensorView = sensorViews.reduce((selected, sensorView) => {
        if (!selected || sensorView.distanceFromCenter > selected.distanceFromCenter) {
            return sensorView;
        }

        return selected;
    }, null);
    const bubbleX = controlSensorView?.bubbleX ?? 0;
    const bubbleY = controlSensorView?.bubbleY ?? 0;
    const displayRoll = controlSensorView?.displayRoll ?? 0;
    const displayPitch = controlSensorView?.displayPitch ?? 0;
    const distanceFromCenter = sensorViews.length
        ? Math.max(...sensorViews.map((sensorView) => sensorView.distanceFromCenter))
        : 0;

    const getZone = () => {
        return getZoneForDistance(distanceFromCenter);
    };

    const zone = getZone();

    const buildSessionSummary = useCallback(() => {
        const trackedDuration = zoneStats.A + zoneStats.B + zoneStats.C;
        const zoneAPercent = trackedDuration > 0 ? Math.round((zoneStats.A / trackedDuration) * 100) : 0;

        return {
            total_steps: Number.isFinite(sessionMetrics?.total_steps) ? sessionMetrics.total_steps : 0,
            avg_speed_mps: Number.isFinite(sessionMetrics?.avg_speed_mps) ? sessionMetrics.avg_speed_mps : null,
            cadence_spm: Number.isFinite(sessionMetrics?.cadence_spm) ? sessionMetrics.cadence_spm : 0,
            avg_step_length_m: Number.isFinite(sessionMetrics?.avg_step_length_m) ? sessionMetrics.avg_step_length_m : null,
            avg_stride_length_m: Number.isFinite(sessionMetrics?.avg_stride_length_m) ? sessionMetrics.avg_stride_length_m : null,
            avg_clearance_m: Number.isFinite(sessionMetrics?.avg_clearance_m) ? sessionMetrics.avg_clearance_m : null,
            symmetry_score: Number.isFinite(sessionMetrics?.symmetry_percent) ? sessionMetrics.symmetry_percent : zoneAPercent,
        };
    }, [sessionMetrics, zoneStats]);

    const buildSessionDetails = useCallback(() => {
        const trackedDuration = zoneStats.A + zoneStats.B + zoneStats.C;
        const centerHoldPercent = trackedDuration > 0 ? Math.round((zoneStats.A / trackedDuration) * 100) : 0;

        return {
            time_in_zone_a_seconds: Number(zoneStats.A.toFixed(1)),
            time_in_zone_b_seconds: Number(zoneStats.B.toFixed(1)),
            time_in_zone_c_seconds: Number(zoneStats.C.toFixed(1)),
            center_hold_percent: centerHoldPercent,
            avg_deviation_deg: Number(avgDeviation.toFixed(1)),
        };
    }, [avgDeviation, zoneStats]);

    const { endSessionIfActive } = usePersistedGatewaySession({
        wsRef,
        userId: user?.uid,
        isConnected,
        shouldStart: gameState === GAME_STATES.PLAYING,
        shouldComplete: gameState === GAME_STATES.COMPLETED,
        sessionType: 'magic_plate',
        buildSummary: buildSessionSummary,
        buildDetails: buildSessionDetails,
        metadata: {
            game_label: 'Magic Plate',
        },
    });

    // === Calibration State ===
    const lastQuaternionRef = useRef(null); // Tracks latest quaternion from the primary visible sensor
    const autoCenterArmedRef = useRef(true); // Auto-center should only run once when entering the game
    const autoCenterFirstDataAtRef = useRef(null); // Warm-up time before checking stillness
    const autoCenterStableSinceRef = useRef(null); // How long the leg has stayed still
    const autoCenterDriftSinceRef = useRef(null); // How long the bubble has drifted while still
    const autoCenterCooldownUntilRef = useRef(0); // Prevent repeated auto-calibrations back-to-back
    const autoCenterPrevQuaternionRef = useRef(null); // Previous quaternion for stillness detection
    const calibrationSourceRef = useRef('manual'); // Track whether calibration was manual or automatic
    const startCalibrationRef = useRef(null); // Ref to call startCalibration from handleSensorData

    const resetSensorRuntimeState = useCallback((sensorState) => {
        sensorState.rawRoll = 0;
        sensorState.rawPitch = 0;
        sensorState.lastSmoothedRoll = 0;
        sensorState.lastSmoothedPitch = 0;
        sensorState.lastSmoothedYaw = 0;
        sensorState.yawBaseline = 0;
        sensorState.yawBaselineInit = false;
        sensorState.displayRoll = 0;
        sensorState.displayPitch = 0;
        sensorState.calibratedRoll = 0;
        sensorState.calibratedPitch = 0;
        sensorState.bubbleX = 0;
        sensorState.bubbleY = 0;
        sensorState.lastDisplayUpdate = 0;
    }, []);

    const getVisibleSensorStates = useCallback(() => {
        return activeSensorKeysRef.current
            .map((sensorKey) => sensorRuntimesRef.current.get(sensorKey))
            .filter(Boolean)
            .sort(sortSensorStates);
    }, []);

    const syncVisibleSensorViews = useCallback(() => {
        activeSensorKeysRef.current = resolveVisibleSensorKeys(sensorRuntimesRef.current);
        const visibleSensorStates = getVisibleSensorStates();
        setSensorViews(visibleSensorStates.map(buildSensorView));
        return visibleSensorStates;
    }, [getVisibleSensorStates]);

    // === WebSocket Connection ===
    useEffect(() => {
        manualDisconnectRef.current = false;
        sensorRuntimesRef.current.clear();
        activeSensorKeysRef.current = [];
        setSensorViews([]);

        const connectWebSocket = () => {
            try {
                wsRef.current = createRealtimeConnection();

                wsRef.current.onopen = () => {
                    console.log('🎯 Balance Game connected to WebSocket');
                    setIsConnected(true);
                };

                wsRef.current.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);

                        // When Calibration page completes → capture current quaternion as reference
                        if (msg.type === 'CALIBRATION_DONE') {
                            let calibratedCount = 0;
                            sensorRuntimesRef.current.forEach((sensorState) => {
                                if (!sensorState.lastQuaternion) {
                                    return;
                                }

                                sensorState.refQuaternion = [...sensorState.lastQuaternion];
                                resetSensorRuntimeState(sensorState);
                                calibratedCount += 1;
                            });

                            if (calibratedCount > 0) {
                                autoCenterArmedRef.current = false;
                                autoCenterFirstDataAtRef.current = null;
                                autoCenterStableSinceRef.current = null;
                                autoCenterDriftSinceRef.current = null;
                                autoCenterCooldownUntilRef.current = 0;
                                autoCenterPrevQuaternionRef.current = null;
                                syncVisibleSensorViews();
                                setGameState(GAME_STATES.READY);
                                gameStateRef.current = GAME_STATES.READY;
                                console.log('🎯 CALIBRATION_DONE → Reference quaternion set for Balance');
                            }
                        }

                        handleSensorData(msg);
                    } catch (e) {
                        console.error('Parse error:', e);
                    }
                };

                wsRef.current.onclose = () => {
                    setIsConnected(false);

                    if (manualDisconnectRef.current) {
                        return;
                    }

                    console.log('WebSocket closed, reconnecting...');
                    setTimeout(connectWebSocket, 3000);
                };

                wsRef.current.onerror = (error) => {
                    console.error('WebSocket error:', error);
                };
            } catch (e) {
                console.error('WebSocket connection error:', e);
            }
        };

        connectWebSocket();

        return () => {
            manualDisconnectRef.current = true;
            endSessionIfActive();
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [endSessionIfActive, resetSensorRuntimeState, syncVisibleSensorViews]);

    // === Handle Sensor Data ===
    const handleSensorData = useCallback((msg) => {
        if (msg.type !== 'DATA') return;

        const sample = normalizeRealtimeSensorSample(msg.payload || {});
        if (!sample) {
            return;
        }

        const sensorRuntimeMap = sensorRuntimesRef.current;
        let sensorState = sensorRuntimeMap.get(sample.sensorKey);

        if (!sensorState) {
            sensorState = createSensorRuntime(sample);
            sensorRuntimeMap.set(sample.sensorKey, sensorState);
        }

        sensorState.label = getRealtimeSensorLabel(sample);
        sensorState.side = sample.side || null;
        sensorState.sensorMount = sample.sensorMount || 'unknown';
        sensorState.lastSeenAt = Date.now();

        const orientation = sensorState.tracker.update({
            ax: sample.ax,
            ay: sample.ay,
            az: sample.az,
            gx: sample.gx,
            gy: sample.gy,
            gz: sample.gz,
            timestampMs: sample.timestampMs ?? sample.timestamp_ms,
        });
        const q = orientation.quaternion;
        sensorState.lastQuaternion = [...q];

        const visibleSensorStates = syncVisibleSensorViews();
        const isVisibleSensor = activeSensorKeysRef.current.includes(sensorState.sensorKey);
        const primarySensorState = visibleSensorStates[0] || sensorState;
        const isPrimarySensor = primarySensorState?.sensorKey === sensorState.sensorKey;

        if (isPrimarySensor) {
            lastQuaternionRef.current = [...q];
        }

        const now = Date.now();
        let isStill = false;

        if (isPrimarySensor) {
            const gyroNorm = typeof orientation.gyroNormRad === 'number' ? orientation.gyroNormRad : null;
            const prevQuaternion = autoCenterPrevQuaternionRef.current;
            const quatDeltaDeg = prevQuaternion ? quatAngleDeg(prevQuaternion, q) : 0;
            const prePlayState = gameStateRef.current === GAME_STATES.CALIBRATING || gameStateRef.current === GAME_STATES.READY;

            autoCenterPrevQuaternionRef.current = [...q];

            if (!autoCenterFirstDataAtRef.current) {
                autoCenterFirstDataAtRef.current = now;
            }

            const warmupDone = now - autoCenterFirstDataAtRef.current >= 2500;
            const gyroStable = gyroNorm === null || gyroNorm < 0.12;
            const quatStable = quatDeltaDeg < 0.25;
            isStill = prePlayState && warmupDone && gyroStable && quatStable;

            const visibleSensorsNeedCalibration = visibleSensorStates.some((visibleSensorState) => !visibleSensorState.refQuaternion);

            if (visibleSensorsNeedCalibration && autoCenterArmedRef.current && !isCalibratingRef.current && now >= autoCenterCooldownUntilRef.current) {
                if (isStill) {
                    if (!autoCenterStableSinceRef.current) {
                        autoCenterStableSinceRef.current = now;
                    }

                    if (now - autoCenterStableSinceRef.current >= 800) {
                        autoCenterStableSinceRef.current = null;
                        autoCenterDriftSinceRef.current = null;
                        autoCenterPrevQuaternionRef.current = null;
                        console.log(`🎯 Auto-center: sensor stable (gyro=${gyroNorm?.toFixed?.(3) ?? 'n/a'}, quatΔ=${quatDeltaDeg.toFixed(3)}°) → calling startCalibration()`);
                        if (startCalibrationRef.current) {
                            startCalibrationRef.current('auto');
                        }
                    }
                } else {
                    autoCenterStableSinceRef.current = null;
                }
            }
        }

        if (isCalibratingRef.current) {
            sensorState.calibrationSamples.push([...q]);
        }

        if (!isVisibleSensor) {
            return;
        }

        if (!sensorState.refQuaternion) {
            syncVisibleSensorViews();
            return;
        }

        // === Relative quaternion: how has orientation changed from reference? ===
        const q_rel = quatMultiply(quatConjugate(sensorState.refQuaternion), q);

        // === Convert to rotation vector [rx, ry, rz] in radians ===
        const rv = quatToRotVec(q_rel);
        const RAD_TO_DEG = 180 / Math.PI;

        // Body frame after gateway remap: X=down, Y=left, Z=forward
        // rv[0]: rotation around X (down) → yaw;  CCW from above = negative rv[0]
        // rv[1]: rotation around Y (left) → pitch; lean forward = negative rv[1]
        // rv[2]: rotation around Z (fwd)  → roll;  lean left = positive rv[2]
        const leanLeftDeg = rv[2] * RAD_TO_DEG;
        const leanFwdDeg = -rv[1] * RAD_TO_DEG;
        const rawYawDeg = -rv[0] * RAD_TO_DEG;

        // === Yaw drift compensation: slow baseline tracks drift, fast movements pass through ===
        if (!sensorState.yawBaselineInit) {
            sensorState.yawBaseline = rawYawDeg;
            sensorState.yawBaselineInit = true;
        } else {
            // Very slow tracking: baseline follows drift (~0.2% per frame at 100Hz)
            sensorState.yawBaseline += (rawYawDeg - sensorState.yawBaseline) * 0.002;
        }
        const yawDeg = rawYawDeg - sensorState.yawBaseline;

        sensorState.rawRoll = leanLeftDeg;
        sensorState.rawPitch = leanFwdDeg;

        // === Apply sensitivity & dead zone ===
        const sens = sensitivityRef.current;
        const DEAD_ZONE = 1.0;
        const RAMP_ZONE = 1.0;
        const applyDeadZone = (value) => {
            const abs = Math.abs(value);
            if (abs < DEAD_ZONE) return 0;
            if (abs < DEAD_ZONE + RAMP_ZONE) {
                const ratio = (abs - DEAD_ZONE) / RAMP_ZONE;
                return Math.sign(value) * ratio * (abs - DEAD_ZONE);
            }
            return value;
        };

        const targetLeanLeft = applyDeadZone(leanLeftDeg * sens);
        const targetLeanFwd = applyDeadZone(leanFwdDeg * sens);
        const targetYaw = applyDeadZone(yawDeg * sens);

        // === Smoothing (LERP) ===
        const smoothFactor = 0.18;
        const smoothedLeanLeft = sensorState.lastSmoothedRoll + (targetLeanLeft - sensorState.lastSmoothedRoll) * smoothFactor;
        const smoothedLeanFwd = sensorState.lastSmoothedPitch + (targetLeanFwd - sensorState.lastSmoothedPitch) * smoothFactor;
        const smoothedYaw = sensorState.lastSmoothedYaw + (targetYaw - sensorState.lastSmoothedYaw) * smoothFactor;

        sensorState.lastSmoothedRoll = smoothedLeanLeft;
        sensorState.lastSmoothedPitch = smoothedLeanFwd;
        sensorState.lastSmoothedYaw = smoothedYaw;

        sensorState.calibratedRoll = smoothedLeanLeft;
        sensorState.calibratedPitch = smoothedLeanFwd;

        // Throttled Display Update (Every 700ms)
        if (now - sensorState.lastDisplayUpdate > 700) {
            sensorState.displayRoll = smoothedLeanLeft;
            sensorState.displayPitch = smoothedLeanFwd;
            sensorState.lastDisplayUpdate = now;
        }

        // === Map to ball position ===
        const maxAngle = 45;

        // Tilt contribution (lean left → ball left, lean forward → ball up)
        let newX = (-smoothedLeanLeft / maxAngle) * 100;
        let newY = (-smoothedLeanFwd / maxAngle) * 100;

        // Yaw contribution (drift-compensated via slow baseline subtraction)
        const yawRad = smoothedYaw * Math.PI / 180;
        const yawAmplitude = Math.min(Math.abs(smoothedYaw), maxAngle) / maxAngle * 100;
        newX += -Math.sin(yawRad) * yawAmplitude;
        newY += -Math.cos(yawRad) * yawAmplitude;

        const centerDistance = getDistanceFromCenter(newX, newY);

        // Clamp to [-100, 100]
        newX = Math.max(-100, Math.min(100, newX));
        newY = Math.max(-100, Math.min(100, newY));

        sensorState.bubbleX = newX;
        sensorState.bubbleY = newY;

        if (isPrimarySensor) {
            const allVisibleSensorsCalibrated = visibleSensorStates.length > 0
                && visibleSensorStates.every((visibleSensorState) => !!visibleSensorState.refQuaternion);

            if (allVisibleSensorsCalibrated && autoCenterArmedRef.current && !isCalibratingRef.current && now >= autoCenterCooldownUntilRef.current) {
                if (isStill && centerDistance > 10) {
                    if (!autoCenterDriftSinceRef.current) {
                        autoCenterDriftSinceRef.current = now;
                    }

                    if (now - autoCenterDriftSinceRef.current >= 900) {
                        autoCenterStableSinceRef.current = null;
                        autoCenterDriftSinceRef.current = null;
                        autoCenterPrevQuaternionRef.current = null;
                        console.log(`🎯 Auto-center: bubble drifted to ${centerDistance.toFixed(1)}% while still → calling startCalibration() again`);
                        if (startCalibrationRef.current) {
                            startCalibrationRef.current('auto');
                        }
                    }
                } else {
                    autoCenterDriftSinceRef.current = null;
                }
            } else {
                autoCenterDriftSinceRef.current = null;
            }
        }

        const nextVisibleSensorStates = syncVisibleSensorViews();

        // Track deviation for average calculation
        if (gameStateRef.current === GAME_STATES.PLAYING && isPrimarySensor) {
            const deviations = nextVisibleSensorStates
                .filter((visibleSensorState) => visibleSensorState.refQuaternion)
                .map((visibleSensorState) => Math.sqrt(
                    visibleSensorState.calibratedRoll ** 2 + visibleSensorState.calibratedPitch ** 2,
                ));

            const deviation = deviations.length
                ? deviations.reduce((sum, value) => sum + value, 0) / deviations.length
                : Math.sqrt(smoothedLeanLeft ** 2 + smoothedLeanFwd ** 2);
            deviationHistoryRef.current.push(deviation);

            if (deviationHistoryRef.current.length > 100) {
                deviationHistoryRef.current.shift();
            }

            const avg = deviationHistoryRef.current.reduce((a, b) => a + b, 0) / deviationHistoryRef.current.length;
            setAvgDeviation(avg);
        }
    }, [syncVisibleSensorViews]);

    // === Calibration ===
    // === Calibration Logic ===
    const finishCalibration = useCallback(() => {
        let calibratedCount = 0;

        sensorRuntimesRef.current.forEach((sensorState) => {
            if (!sensorState.calibrationSamples.length) {
                return;
            }

            sensorState.refQuaternion = [...sensorState.calibrationSamples[sensorState.calibrationSamples.length - 1]];
            sensorState.calibrationSamples = [];
            resetSensorRuntimeState(sensorState);
            calibratedCount += 1;
        });

        if (calibratedCount > 0) {
            autoCenterArmedRef.current = false;
            autoCenterFirstDataAtRef.current = Date.now();
            autoCenterStableSinceRef.current = null;
            autoCenterDriftSinceRef.current = null;
            autoCenterPrevQuaternionRef.current = null;
            syncVisibleSensorViews();
            console.log('✅ Re-centered: New reference quaternion set');
        }

        setIsCalibrating(false);
        isCalibratingRef.current = false;
        setGameState(calibratedCount > 0 ? GAME_STATES.READY : GAME_STATES.CALIBRATING);
        gameStateRef.current = calibratedCount > 0 ? GAME_STATES.READY : GAME_STATES.CALIBRATING;
    }, [resetSensorRuntimeState, syncVisibleSensorViews]);

    const startCalibration = (source = 'manual') => {
        calibrationSourceRef.current = source;
        autoCenterArmedRef.current = source === 'auto';
        autoCenterFirstDataAtRef.current = Date.now();
        autoCenterStableSinceRef.current = null;
        autoCenterDriftSinceRef.current = null;
        autoCenterCooldownUntilRef.current = source === 'auto' ? Date.now() + 2800 : 0;
        autoCenterPrevQuaternionRef.current = null;
        setIsCalibrating(true);
        isCalibratingRef.current = true;
        sensorRuntimesRef.current.forEach((sensorState) => {
            sensorState.calibrationSamples = [];
        });
        setGameState(GAME_STATES.CALIBRATING);
        gameStateRef.current = GAME_STATES.CALIBRATING;

        // Collect samples for 1.5s
        setTimeout(() => {
            finishCalibration();
        }, 1500);
    };

    // Keep ref updated so handleSensorData auto-center can call the EXACT same function
    startCalibrationRef.current = startCalibration;

    // === Session Timer ===
    useEffect(() => {
        if (gameState === GAME_STATES.PLAYING) {
            timerRef.current = setInterval(() => {
                setSessionTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [gameState]);

    // === Time In Zone Counter ===
    // === Zone Stats Counter ===
    useEffect(() => {
        if (gameState === GAME_STATES.PLAYING) {
            zoneTimerRef.current = setInterval(() => {
                const currentZone = zone; // Capture current zone

                // Update Time In Zone (Legacy, mainly for A)
                if (currentZone === 'A') {
                    setTimeInZone(prev => prev + 0.1);
                }

                // Update Zone Stats
                setZoneStats(prev => ({
                    ...prev,
                    [currentZone]: (prev[currentZone] || 0) + 0.1
                }));

            }, 100);
        } else {
            if (zoneTimerRef.current) {
                clearInterval(zoneTimerRef.current);
            }
        }

        return () => {
            if (zoneTimerRef.current) {
                clearInterval(zoneTimerRef.current);
            }
        };
    }, [gameState, zone]);

    // === Sync sensitivity ref with state ===
    useEffect(() => {
        sensitivityRef.current = sensitivity;
    }, [sensitivity]);

    // === Game Controls ===
    const startSession = () => {
        autoCenterArmedRef.current = false;
        autoCenterStableSinceRef.current = null;
        autoCenterDriftSinceRef.current = null;
        setGameState(GAME_STATES.PLAYING);
        gameStateRef.current = GAME_STATES.PLAYING;
        setTimeInZone(0);
        setZoneStats({ A: 0, B: 0, C: 0 });
        setSessionTime(0);
        setAvgDeviation(0);
        setSessionMetrics({});
        deviationHistoryRef.current = [];
    };

    const pauseSession = () => {
        setGameState(GAME_STATES.PAUSED);
        gameStateRef.current = GAME_STATES.PAUSED;
    };

    const resumeSession = () => {
        autoCenterArmedRef.current = false;
        autoCenterStableSinceRef.current = null;
        autoCenterDriftSinceRef.current = null;
        setGameState(GAME_STATES.PLAYING);
        gameStateRef.current = GAME_STATES.PLAYING;
    };

    const stopSession = () => {
        setGameState(GAME_STATES.COMPLETED);
        gameStateRef.current = GAME_STATES.COMPLETED;
    };

    const goToNextGame = () => {
        navigate('/game/rhythm');
    };

    const resetSession = () => {
        setGameState(GAME_STATES.READY);
        gameStateRef.current = GAME_STATES.READY;
        sensorRuntimesRef.current.forEach((sensorState) => {
            sensorState.tracker.reset();
            sensorState.calibrationSamples = [];
            resetSensorRuntimeState(sensorState);
        });
        syncVisibleSensorViews();
        setTimeInZone(0);
        setZoneStats({ A: 0, B: 0, C: 0 });
        setSessionTime(0);
        setAvgDeviation(0);
        setSessionMetrics({});
        deviationHistoryRef.current = [];
    };

    // === Format Time ===
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // === Get Zone Colors ===
    const getZoneColor = () => {
        switch (zone) {
            case 'A': return { bubble: 'bg-emerald-500', glow: 'shadow-[0_0_30px_rgba(16,185,129,0.6)]', ring: 'ring-emerald-400' };
            case 'B': return { bubble: 'bg-amber-400', glow: '', ring: 'ring-amber-400' };
            default: return { bubble: 'bg-red-500', glow: '', ring: 'ring-red-400' };
        }
    };

    const zoneColors = getZoneColor();
    const hasDualSensors = sensorViews.length > 1;
    const activeBallViews = sensorViews.length > 0 ? sensorViews : [{
        key: 'placeholder',
        label: 'Sensor',
        side: null,
        bubbleX: 0,
        bubbleY: 0,
        distanceFromCenter: 0,
        zone: 'A',
        placeholder: true,
    }];

    const getSensorBubbleClasses = (sensorView) => {
        if (sensorView.placeholder) {
            return 'bg-gradient-to-br from-slate-300 to-slate-400 shadow-slate-200/60';
        }

        if (sensorView.side === 'L') {
            return 'bg-gradient-to-br from-sky-400 to-blue-600 shadow-sky-300/50';
        }

        if (sensorView.side === 'R') {
            return 'bg-gradient-to-br from-rose-400 to-red-600 shadow-rose-300/50';
        }

        return zone === 'A'
            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-300/50'
            : zone === 'B'
                ? 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-300/50'
                : 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-300/50';
    };

    const getSensorBadgeClasses = (sensorView) => {
        if (sensorView.side === 'L') {
            return 'bg-sky-100 text-sky-700';
        }

        if (sensorView.side === 'R') {
            return 'bg-rose-100 text-rose-700';
        }

        return 'bg-slate-100 text-slate-700';
    };

    // === Direction Hints ===
    const getDirectionHint = () => {
        if (zone === 'A') return null;

        const hints = [];
        if (bubbleX < -20) hints.push({ dir: 'right', icon: ChevronRight, text: 'กดขวา' });
        if (bubbleX > 20) hints.push({ dir: 'left', icon: ChevronLeft, text: 'กดซ้าย' });
        if (bubbleY < -20) hints.push({ dir: 'down', icon: ChevronDown, text: 'กดส้นเท้า' });
        if (bubbleY > 20) hints.push({ dir: 'up', icon: ChevronUp, text: 'กดปลายเท้า' });

        return hints;
    };

    const directionHints = getDirectionHint();

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/therapy')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <img src={derndeeLogo} alt="DernDee" className="h-10 sm:h-12 object-contain" />
                </div>

                <div className="text-center">
                    {/* <h1 className="text-xl sm:text-2xl font-extrabold text-gray-800">Balance</h1>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium">Ankle Stability Training</p> */}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={startCalibration}
                        disabled={isCalibrating}
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-1 ${isCalibrating
                            ? 'bg-gray-200 text-gray-500'
                            : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-md'
                            }`}
                    >
                        <Target className="w-4 h-4" />
                        <span className="hidden sm:inline">{isCalibrating ? 'Centering...' : 'Re-center'}</span>
                    </button>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-colors"
                    >
                        <Settings className="w-5 h-5 text-blue-600" />
                    </button>
                </div>
            </header>

            {/* Settings Panel */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-extrabold text-gray-800">Settings</h3>
                            <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* Sensitivity */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                ความไว: <span className="text-blue-600 font-bold">{sensitivity.toFixed(1)}x</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="5"
                                step="0.5"
                                value={sensitivity}
                                onChange={(e) => setSensitivity(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>1x (ละเอียด)</span>
                                <span>5x (ไว)</span>
                            </div>
                        </div>

                        {/* Current Offset Display */}
                        <div className="bg-gray-50 rounded-xl p-4">
                            <div className="text-sm text-gray-500 mb-2">ค่า Offset ปัจจุบัน</div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-gray-400">Roll</div>
                                    <div className="text-lg font-bold text-gray-700">{offsetRoll.toFixed(1)}°</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400">Pitch</div>
                                    <div className="text-lg font-bold text-gray-700">{offsetPitch.toFixed(1)}°</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">

                {/* LEFT: Game Board (Visuals) */}
                <div className="lg:col-span-8 flex flex-col items-center justify-center min-h-[50vh] lg:min-h-[75vh]">

                    {/* Timer (Mobile Only) */}
                    <div className="lg:hidden text-center mb-4">
                        <span className="text-4xl font-extrabold tracking-tight text-gray-800">
                            {formatTime(sessionTime)}
                        </span>
                    </div>

                    {/* Balance Zone (Game) */}
                    <div className="relative w-full aspect-square max-w-md lg:max-w-2xl bg-white rounded-full shadow-[inset_0_4px_20px_rgba(0,0,0,0.1)] border-8 border-white ring-4 ring-blue-100 flex items-center justify-center overflow-hidden transition-all duration-300">
                        {/* Grid Lines */}
                        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                            <div className="border-r border-b border-gray-100"></div>
                            <div className="border-b border-gray-100"></div>
                            <div className="border-r border-gray-100"></div>
                            <div></div>
                        </div>

                        {/* === Directional Feedback Overlays === */}
                        {/* Top: Lean Fwd (When bubble is at Bottom / Y > 15) */}
                        <div className={`absolute top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-3 py-1 rounded-full font-bold shadow-lg transition-opacity duration-200 z-20 ${bubbleY > 15 ? 'opacity-100' : 'opacity-0'}`}>
                            Lean Fwd
                        </div>
                        {/* Bottom: Lean Back (When bubble is at Top / Y < -15) */}
                        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-3 py-1 rounded-full font-bold shadow-lg transition-opacity duration-200 z-20 ${bubbleY < -15 ? 'opacity-100' : 'opacity-0'}`}>
                            Lean Back
                        </div>
                        {/* Left: Lean Right (When bubble is at Left / X < -15) */}
                        <div className={`absolute left-4 top-1/2 -translate-y-1/2 bg-red-500 text-white px-3 py-1 rounded-full font-bold shadow-lg transition-opacity duration-200 z-20 ${bubbleX < -15 ? 'opacity-100' : 'opacity-0'}`}>
                            Lean Right
                        </div>
                        {/* Right: Lean Left (When bubble is at Right / X > 15) */}
                        <div className={`absolute right-4 top-1/2 -translate-y-1/2 bg-red-500 text-white px-3 py-1 rounded-full font-bold shadow-lg transition-opacity duration-200 z-20 ${bubbleX > 15 ? 'opacity-100' : 'opacity-0'}`}>
                            Lean Left
                        </div>

                        {/* Center Target Zone (Green - A) */}
                        <div className={`absolute w-1/3 h-1/3 rounded-full border-4 transition-all duration-300 ${zone === 'A'
                            ? 'bg-emerald-100/50 border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.3)]'
                            : 'bg-gray-50 border-gray-200'
                            }`}></div>

                        {/* Warning Zone (Yellow - B) */}
                        <div className={`absolute w-2/3 h-2/3 rounded-full border-2 border-dashed transition-all duration-300 ${zone === 'B'
                            ? 'border-amber-400 bg-amber-50/10'
                            : 'border-gray-200'
                            }`}></div>

                        {/* Crosshairs */}
                        <div className="absolute w-full h-[1px] bg-gray-200/50"></div>
                        <div className="absolute h-full w-[1px] bg-gray-200/50"></div>

                        {/* THE BALL (Bubble) */}
                        {activeBallViews.map((sensorView) => {
                            const largeBall = !hasDualSensors;
                            const ballRadius = typeof window !== 'undefined' && window.innerWidth >= 1024
                                ? (largeBall ? 32 : 24)
                                : (largeBall ? 20 : 14);

                            return (
                                <div
                                    key={sensorView.key}
                                    className={`absolute rounded-full shadow-2xl transition-all duration-100 ease-out border-4 border-white z-10 ${largeBall ? 'w-10 h-10 lg:w-16 lg:h-16' : 'w-7 h-7 lg:w-12 lg:h-12'} ${getSensorBubbleClasses(sensorView)}`}
                                    style={{
                                        left: `calc(50% + ${sensorView.bubbleX * 2.5}px - ${ballRadius}px)`,
                                        top: `calc(50% + ${sensorView.bubbleY * 2.5}px - ${ballRadius}px)`,
                                        transform: sensorView.zone === 'B' ? 'scale(1.05)' : 'scale(1)'
                                    }}
                                >
                                    <div className="absolute top-1 left-2 w-3 h-3 bg-white/40 rounded-full"></div>
                                    {!sensorView.placeholder && (
                                        <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase shadow-sm ${getSensorBadgeClasses(sensorView)}`}>
                                            {sensorView.side === 'L' ? 'L' : sensorView.side === 'R' ? 'R' : 'S'}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Zone Status (Mobile) */}
                    <div className="lg:hidden flex items-center gap-2 px-6 py-2 bg-white rounded-full shadow-lg mt-6">
                        <div className={`w-3 h-3 rounded-full ${zone === 'A' ? 'bg-emerald-500 animate-pulse' :
                            zone === 'B' ? 'bg-amber-500' : 'bg-red-500'
                            }`}></div>
                        <span className="font-bold text-gray-700">
                            {zone === 'A' ? 'Perfect' : zone === 'B' ? 'Warning' : 'Unstable'}
                        </span>
                    </div>
                </div>

                {/* RIGHT: Stats & Controls Panel */}
                <div className="lg:col-span-4 flex flex-col gap-6 w-full">

                    {/* Timer & Main Stats (Desktop) */}
                    <div className="hidden lg:flex flex-col bg-white rounded-3xl shadow-xl p-8 text-center border border-blue-50">
                        <div className="text-sm font-bold text-gray-400 tracking-wider uppercase mb-2">Session Time</div>
                        <div className="text-6xl font-black text-gray-800 tabular-nums">
                            {formatTime(sessionTime)}
                        </div>
                        <div className="mt-6 flex items-center justify-center gap-3 px-6 py-3 bg-gray-50 rounded-2xl">
                            <div className={`w-4 h-4 rounded-full ${zone === 'A' ? 'bg-emerald-500 animate-pulse' :
                                zone === 'B' ? 'bg-amber-500' : 'bg-red-500'
                                }`}></div>
                            <span className="text-xl font-bold text-gray-700">
                                {zone === 'A' ? 'Perfect Balance' : zone === 'B' ? 'Drifting' : 'Unstable'}
                            </span>
                        </div>
                    </div>

                    {/* Detail Stats */}
                    {hasDualSensors ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {sensorViews.map((sensorView) => (
                                <div key={sensorView.key} className="bg-white rounded-2xl lg:rounded-3xl shadow-lg p-5 hover:scale-105 transition-transform">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{sensorView.label}</div>
                                            <div className="text-sm font-bold text-gray-800">
                                                {sensorView.side === 'L' ? 'Left Shank' : sensorView.side === 'R' ? 'Right Shank' : 'Sensor'}
                                            </div>
                                        </div>
                                        <div className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${getSensorBadgeClasses(sensorView)}`}>
                                            {sensorView.zone === 'A' ? 'Stable' : sensorView.zone === 'B' ? 'Drifting' : 'Unstable'}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl bg-slate-50 p-3 text-center">
                                            <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Left / Right</div>
                                            <div className="mt-1 text-2xl font-extrabold text-slate-800 tabular-nums">{Math.abs(sensorView.displayRoll).toFixed(1)}°</div>
                                            <div className="mt-1 text-xs font-bold text-slate-500">
                                                {sensorView.displayRoll > 0 ? 'Right' : sensorView.displayRoll < 0 ? 'Left' : '-'}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl bg-slate-50 p-3 text-center">
                                            <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Fwd / Back</div>
                                            <div className="mt-1 text-2xl font-extrabold text-slate-800 tabular-nums">{Math.abs(sensorView.displayPitch).toFixed(1)}°</div>
                                            <div className="mt-1 text-xs font-bold text-slate-500">
                                                {sensorView.displayPitch > 0 ? 'Fwd' : sensorView.displayPitch < 0 ? 'Back' : '-'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white rounded-2xl lg:rounded-3xl shadow-lg p-5 text-center flex flex-col items-center justify-center hover:scale-105 transition-transform">
                                <div className="text-xs lg:text-sm text-gray-500 mb-1 font-semibold uppercase tracking-wide">Left / Right</div>
                                <div className="text-3xl lg:text-4xl font-extrabold text-blue-600 tabular-nums">
                                    {Math.abs(displayRoll).toFixed(1)}°
                                </div>
                                <div className={`text-xs font-bold mt-1 px-2 py-0.5 rounded ${Math.abs(displayRoll) < 5 ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-500'}`}>
                                    {displayRoll > 0 ? 'Right' : displayRoll < 0 ? 'Left' : '-'}
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl lg:rounded-3xl shadow-lg p-5 text-center flex flex-col items-center justify-center hover:scale-105 transition-transform">
                                <div className="text-xs lg:text-sm text-gray-500 mb-1 font-semibold uppercase tracking-wide">Fwd / Back</div>
                                <div className="text-3xl lg:text-4xl font-extrabold text-blue-600 tabular-nums">
                                    {Math.abs(displayPitch).toFixed(1)}°
                                </div>
                                <div className={`text-xs font-bold mt-1 px-2 py-0.5 rounded ${Math.abs(displayPitch) < 5 ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-500'}`}>
                                    {displayPitch > 0 ? 'Fwd' : displayPitch < 0 ? 'Back' : '-'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Target Stats (Score) */}
                    <div className="bg-white rounded-2xl lg:rounded-3xl shadow-lg p-6 flex items-center justify-between">
                        <div className="text-left">
                            <div className="text-sm text-gray-400 font-bold uppercase">Time in Zone</div>
                            <div className="text-2xl font-black text-gray-800">
                                {timeInZone.toFixed(1)}<span className="text-lg text-gray-500 ml-1">s</span>
                            </div>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <Target className="w-6 h-6" />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-3 mt-auto">
                        {gameState === GAME_STATES.READY && (
                            <button
                                onClick={startSession}
                                className="w-full py-5 lg:py-6 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xl rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                            >
                                <Play className="w-7 h-7" />
                                <span>Start Balance</span>
                            </button>
                        )}

                        {gameState === GAME_STATES.PLAYING && (
                            <div className="flex gap-3">
                                <button
                                    onClick={pauseSession}
                                    className="flex-1 py-5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
                                >
                                    <Pause className="w-6 h-6" />
                                    <span>Pause</span>
                                </button>
                                <button
                                    onClick={stopSession}
                                    className="flex-1 py-5 bg-red-500 hover:bg-red-600 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
                                >
                                    <Square className="w-6 h-6" />
                                    <span>Stop</span>
                                </button>
                            </div>
                        )}

                        {gameState === GAME_STATES.PAUSED && (
                            <div className="flex gap-3">
                                <button
                                    onClick={resumeSession}
                                    className="flex-1 py-5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
                                >
                                    <Play className="w-6 h-6" />
                                    <span>Resume</span>
                                </button>
                                <button
                                    onClick={stopSession}
                                    className="flex-1 py-5 bg-red-500 hover:bg-red-600 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
                                >
                                    <Square className="w-6 h-6" />
                                    <span>Stop</span>
                                </button>
                            </div>
                        )}

                        {gameState === GAME_STATES.COMPLETED && (
                            <button
                                onClick={resetSession}
                                className="w-full py-5 lg:py-6 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xl rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                            >
                                <Play className="w-7 h-7" />
                                <span>Try Again</span>
                            </button>
                        )}

                        <button
                            onClick={goToNextGame}
                            className="w-full py-4 border-2 border-blue-200 bg-white hover:bg-blue-50 text-blue-700 font-extrabold text-lg rounded-2xl shadow-lg transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                        >
                            <span>Next: Rhythm Drummer</span>
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default GameBalance;

