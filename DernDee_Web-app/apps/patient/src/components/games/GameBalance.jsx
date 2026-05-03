import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrientationTracker } from '@shared/sensor/orientationTracker.js';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { createRealtimeConnection } from '@shared/gateway/realtimeTransport.js';
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
    const calibrationSamplesRef = useRef([]);
    const sensitivityRef = useRef(1.0);

    // === Real-time Sensor Data ===
    const [rawRoll, setRawRoll] = useState(0);
    const [rawPitch, setRawPitch] = useState(0);
    const [calibratedRoll, setCalibratedRoll] = useState(0); // Display Calibrated Roll
    const [calibratedPitch, setCalibratedPitch] = useState(0); // Display Calibrated Pitch
    const [displayRoll, setDisplayRoll] = useState(0); // Throttled Display Roll
    const [displayPitch, setDisplayPitch] = useState(0); // Throttled Display Pitch

    // Computed position (after calibration and sensitivity)
    const [bubbleX, setBubbleX] = useState(0); // -100 to 100 (%)
    const [bubbleY, setBubbleY] = useState(0); // -100 to 100 (%)

    // Smoothing Refs
    const lastSmoothedRollRef = useRef(0);
    const lastSmoothedPitchRef = useRef(0);
    const lastDisplayUpdateRef = useRef(0);

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
    const activeSensorNameRef = useRef(null);
    const activeSensorMountRef = useRef(null);
    const orientationTrackerRef = useRef(null);

    if (!orientationTrackerRef.current) {
        orientationTrackerRef.current = new OrientationTracker();
    }

    // === Computed Values ===
    const distanceFromCenter = Math.sqrt(bubbleX * bubbleX + bubbleY * bubbleY);

    const getZone = () => {
        if (distanceFromCenter <= ZONE_A_THRESHOLD) return 'A'; // Perfect
        if (distanceFromCenter <= ZONE_B_THRESHOLD) return 'B'; // Warning
        return 'C'; // Critical
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
    const refQuaternionRef = useRef(null); // Reference quaternion — set by Calibration page or Re-center
    const lastQuaternionRef = useRef(null); // Always tracks latest quaternion from gateway
    const lastSmoothedYawRef = useRef(0);
    const yawBaselineRef = useRef(0); // Slow-moving yaw baseline for drift compensation
    const yawBaselineInitRef = useRef(false); // Whether baseline has been initialized
    const autoCenterArmedRef = useRef(true); // Auto-center should only run once when entering the game
    const autoCenterFirstDataAtRef = useRef(null); // Warm-up time before checking stillness
    const autoCenterStableSinceRef = useRef(null); // How long the leg has stayed still
    const autoCenterDriftSinceRef = useRef(null); // How long the bubble has drifted while still
    const autoCenterCooldownUntilRef = useRef(0); // Prevent repeated auto-calibrations back-to-back
    const autoCenterPrevQuaternionRef = useRef(null); // Previous quaternion for stillness detection
    const calibrationSourceRef = useRef('manual'); // Track whether calibration was manual or automatic
    const startCalibrationRef = useRef(null); // Ref to call startCalibration from handleSensorData

    // === WebSocket Connection ===
    useEffect(() => {
        manualDisconnectRef.current = false;
        activeSensorNameRef.current = null;
        activeSensorMountRef.current = null;
        orientationTrackerRef.current?.reset();

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
                            if (lastQuaternionRef.current) {
                                refQuaternionRef.current = [...lastQuaternionRef.current];
                                lastSmoothedRollRef.current = 0;
                                lastSmoothedPitchRef.current = 0;
                                lastSmoothedYawRef.current = 0;
                                yawBaselineRef.current = 0;
                                yawBaselineInitRef.current = false;
                                autoCenterArmedRef.current = false;
                                autoCenterFirstDataAtRef.current = null;
                                autoCenterStableSinceRef.current = null;
                                autoCenterDriftSinceRef.current = null;
                                autoCenterCooldownUntilRef.current = 0;
                                autoCenterPrevQuaternionRef.current = null;
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
    }, [endSessionIfActive]);

    // === Handle Sensor Data ===
    const handleSensorData = useCallback((msg) => {
        if (msg.type !== 'DATA') return;

        const payload = msg.payload;

        if (!Array.isArray(payload?.raw_accel) || !Array.isArray(payload?.raw_gyro)) {
            return;
        }

        const isPreferredSensor = payload?.sensor_mount === 'shank';
        if (!activeSensorNameRef.current) {
            activeSensorNameRef.current = payload?.name ?? null;
            activeSensorMountRef.current = payload?.sensor_mount ?? 'unknown';
        } else if (
            isPreferredSensor
            && activeSensorMountRef.current !== 'shank'
            && payload?.name
            && payload.name !== activeSensorNameRef.current
        ) {
            activeSensorNameRef.current = payload.name;
            activeSensorMountRef.current = 'shank';
            orientationTrackerRef.current?.reset();
        }

        if (!payload?.name || payload.name !== activeSensorNameRef.current) {
            return;
        }

        const [ax, ay, az] = payload.raw_accel;
        const [gx, gy, gz] = payload.raw_gyro;
        const orientation = orientationTrackerRef.current.update({
            ax,
            ay,
            az,
            gx,
            gy,
            gz,
            timestampMs: payload.timestamp_ms,
        });
        const q = orientation.quaternion;

        // Always track latest quaternion
        lastQuaternionRef.current = [...q];

        const now = Date.now();
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
        const isStill = prePlayState && warmupDone && gyroStable && quatStable;

        // Auto-center on game entry: wait for stable sensor data, then call startCalibration()
        if (!refQuaternionRef.current && autoCenterArmedRef.current && !isCalibratingRef.current && now >= autoCenterCooldownUntilRef.current) {
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

        // Collect samples during manual Re-center calibration
        if (isCalibratingRef.current) {
            calibrationSamplesRef.current.push([...q]);
        }

        // Need reference quaternion to compute relative orientation
        if (!refQuaternionRef.current) return;

        // === Relative quaternion: how has orientation changed from reference? ===
        const q_rel = quatMultiply(quatConjugate(refQuaternionRef.current), q);

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
        if (!yawBaselineInitRef.current) {
            yawBaselineRef.current = rawYawDeg;
            yawBaselineInitRef.current = true;
        } else {
            // Very slow tracking: baseline follows drift (~0.2% per frame at 100Hz)
            yawBaselineRef.current += (rawYawDeg - yawBaselineRef.current) * 0.002;
        }
        const yawDeg = rawYawDeg - yawBaselineRef.current;

        setRawRoll(leanLeftDeg);
        setRawPitch(leanFwdDeg);

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
        const smoothedLeanLeft = lastSmoothedRollRef.current + (targetLeanLeft - lastSmoothedRollRef.current) * smoothFactor;
        const smoothedLeanFwd = lastSmoothedPitchRef.current + (targetLeanFwd - lastSmoothedPitchRef.current) * smoothFactor;
        const smoothedYaw = lastSmoothedYawRef.current + (targetYaw - lastSmoothedYawRef.current) * smoothFactor;

        lastSmoothedRollRef.current = smoothedLeanLeft;
        lastSmoothedPitchRef.current = smoothedLeanFwd;
        lastSmoothedYawRef.current = smoothedYaw;

        setCalibratedRoll(smoothedLeanLeft);
        setCalibratedPitch(smoothedLeanFwd);

        // Throttled Display Update (Every 700ms)
        if (now - lastDisplayUpdateRef.current > 700) {
            setDisplayRoll(smoothedLeanLeft);
            setDisplayPitch(smoothedLeanFwd);
            lastDisplayUpdateRef.current = now;
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

        const centerDistance = Math.sqrt(newX * newX + newY * newY);

        if (refQuaternionRef.current && autoCenterArmedRef.current && !isCalibratingRef.current && now >= autoCenterCooldownUntilRef.current) {
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

        // Clamp to [-100, 100]
        newX = Math.max(-100, Math.min(100, newX));
        newY = Math.max(-100, Math.min(100, newY));

        setBubbleX(newX);
        setBubbleY(newY);

        // Track deviation for average calculation
        if (gameStateRef.current === GAME_STATES.PLAYING) {
            const deviation = Math.sqrt(smoothedLeanLeft ** 2 + smoothedLeanFwd ** 2);
            deviationHistoryRef.current.push(deviation);

            if (deviationHistoryRef.current.length > 100) {
                deviationHistoryRef.current.shift();
            }

            const avg = deviationHistoryRef.current.reduce((a, b) => a + b, 0) / deviationHistoryRef.current.length;
            setAvgDeviation(avg);
        }
    }, []); // No deps needed since everything uses refs

    // === Calibration ===
    // === Calibration Logic ===
    const finishCalibration = useCallback(() => {
        const samples = calibrationSamplesRef.current;
        if (samples.length > 0) {
            // Use the last quaternion sample as new reference orientation
            refQuaternionRef.current = [...samples[samples.length - 1]];
            // Reset smoothing state so ball snaps to center
            lastSmoothedRollRef.current = 0;
            lastSmoothedPitchRef.current = 0;
            lastSmoothedYawRef.current = 0;
            yawBaselineRef.current = 0;
            yawBaselineInitRef.current = false;
            autoCenterArmedRef.current = calibrationSourceRef.current === 'auto';
            autoCenterFirstDataAtRef.current = Date.now();
            autoCenterStableSinceRef.current = null;
            autoCenterDriftSinceRef.current = null;
            autoCenterPrevQuaternionRef.current = null;
            console.log('✅ Re-centered: New reference quaternion set');
        }

        setIsCalibrating(false);
        isCalibratingRef.current = false;
        setGameState(GAME_STATES.READY);
        gameStateRef.current = GAME_STATES.READY;
    }, []);

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
        calibrationSamplesRef.current = [];
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
        activeSensorNameRef.current = null;
        activeSensorMountRef.current = null;
        orientationTrackerRef.current?.reset();
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
                        <div
                            className={`absolute w-10 h-10 lg:w-16 lg:h-16 rounded-full shadow-2xl transition-all duration-100 ease-out border-4 border-white z-10 
                            ${zone === 'A' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-300/50' :
                                    zone === 'B' ? 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-300/50' :
                                        'bg-gradient-to-br from-red-400 to-red-600 shadow-red-300/50'
                                }`}
                            style={{
                                left: `calc(50% + ${bubbleX * 2.5}px - ${window.innerWidth >= 1024 ? 32 : 20}px)`,
                                top: `calc(50% + ${bubbleY * 2.5}px - ${window.innerWidth >= 1024 ? 32 : 20}px)`,
                                transform: zone === 'B' ? 'scale(1.05)' : 'scale(1)'
                            }}
                        >
                            {/* Shine */}
                            <div className="absolute top-1 left-2 w-3 h-3 bg-white/40 rounded-full"></div>
                        </div>
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
                    <div className="grid grid-cols-2 gap-4">
                        {/* Roll Card */}
                        <div className="bg-white rounded-2xl lg:rounded-3xl shadow-lg p-5 text-center flex flex-col items-center justify-center hover:scale-105 transition-transform">
                            <div className="text-xs lg:text-sm text-gray-500 mb-1 font-semibold uppercase tracking-wide">Left / Right</div>
                            <div className="text-3xl lg:text-4xl font-extrabold text-blue-600 tabular-nums">
                                {Math.abs(displayRoll).toFixed(1)}°
                            </div>
                            <div className={`text-xs font-bold mt-1 px-2 py-0.5 rounded ${Math.abs(displayRoll) < 5 ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-500'}`}>
                                {displayRoll > 0 ? 'Right' : displayRoll < 0 ? 'Left' : '-'}
                            </div>
                        </div>

                        {/* Pitch Card */}
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

