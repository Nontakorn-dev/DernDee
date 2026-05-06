import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GatewayLiftEstimator } from '@shared/gait/gatewayLiftEstimator.js';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { createRealtimeConnection } from '@shared/gateway/realtimeTransport.js';
import {
    getRealtimeSensorLabel,
    getRealtimeSensorSideOrder,
    normalizeRealtimeSensorSample,
} from '@shared/gateway/realtimeSensorUtils.js';
import { usePersistedGatewaySession } from '@shared/hooks/usePersistedGatewaySession.js';
import { ArrowLeft, ArrowRight, Settings, Pause, Play, Square, X, Volume2, VolumeX, Vibrate } from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

// === CONSTANTS ===
const MAX_SCALE_HEIGHT = 30; // Max display height in cm
const DEFAULT_TARGET_HEIGHT = 5; // Default target in cm
const BASELINE_HEIGHT = 5; // Standard baseline in cm
const REP_RESET_THRESHOLD = 3; // Must go below 3cm to count next rep
const REP_REARM_HOLD_MS = 140;
const GATEWAY_HEIGHT_ALPHA = 0.6;
const MAX_VISIBLE_SENSORS = 2;
const SENSOR_STALE_AFTER_MS = 2500;

const GAME_STATES = {
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED'
};

function sortSensorStates(left, right) {
    const sideDelta = getRealtimeSensorSideOrder(left?.side) - getRealtimeSensorSideOrder(right?.side);
    if (sideDelta !== 0) {
        return sideDelta;
    }

    return (right?.lastSeenAt || 0) - (left?.lastSeenAt || 0);
}

function resolveVisibleSensorKeys(sensorRuntimeMap) {
    const now = Date.now();
    const activeSensors = Array.from(sensorRuntimeMap.values())
        .filter((sensorState) => now - sensorState.lastSeenAt <= SENSOR_STALE_AFTER_MS)
        .sort(sortSensorStates);

    const shankSensors = activeSensors.filter((sensorState) => sensorState.sensorMount === 'shank');
    const preferredSensors = shankSensors.length > 0 ? shankSensors : activeSensors;

    return preferredSensors
        .slice(0, shankSensors.length > 0 ? MAX_VISIBLE_SENSORS : 1)
        .map((sensorState) => sensorState.sensorKey);
}

function createClearanceSensorRuntime(sample) {
    return {
        sensorKey: sample.sensorKey,
        label: getRealtimeSensorLabel(sample),
        side: sample.side || null,
        sensorMount: sample.sensorMount || 'unknown',
        estimator: new GatewayLiftEstimator({ sensorMount: sample.sensorMount || 'shank' }),
        currentHeight: 0,
        stabilityScore: 100,
        isStance: true,
        lastSeenAt: Date.now(),
    };
}

const GameClearance = () => {
    const navigate = useNavigate();
    const { user } = useUserAuth();

    // === Game State ===
    const [gameState, setGameState] = useState(GAME_STATES.READY);
    const [targetHeight, setTargetHeight] = useState(DEFAULT_TARGET_HEIGHT);
    const [sensitivity, setSensitivity] = useState(1.0);
    const [showSettings, setShowSettings] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [vibrationEnabled, setVibrationEnabled] = useState(true);

    // === Real-time Data ===
    const [currentHeight, setCurrentHeight] = useState(0);
    const [reps, setReps] = useState(0);
    const [totalReps, setTotalReps] = useState(20); // Goal
    const [stabilityScore, setStabilityScore] = useState(100);
    const [sessionTime, setSessionTime] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [sessionMetrics, setSessionMetrics] = useState({});

    // === Rep Counting State Machine ===
    const [repState, setRepState] = useState('READY'); // READY, HIT_TARGET
    const repResetCandidateStartedAtRef = useRef(null);
    const repResetEligibleRef = useRef(false);

    // === WebSocket ===
    const wsRef = useRef(null);
    const timerRef = useRef(null);
    const manualDisconnectRef = useRef(false);
    const sensorRuntimesRef = useRef(new Map());
    const activeSensorKeysRef = useRef([]);

    // === Audio ===
    const successSoundRef = useRef(null);

    // === Derived State ===
    const displayHeightPercent = Math.min(100, (currentHeight / MAX_SCALE_HEIGHT) * 100);
    const targetLinePercent = (targetHeight / MAX_SCALE_HEIGHT) * 100;

    // Determine gauge state based on height
    const getGaugeState = () => {
        if (currentHeight >= targetHeight) return 'SUCCESS';
        if (currentHeight >= targetHeight * 0.5) return 'APPROACHING';
        return 'IDLE';
    };

    const gaugeState = getGaugeState();

    const getVisibleSensorStates = useCallback(() => {
        return activeSensorKeysRef.current
            .map((sensorKey) => sensorRuntimesRef.current.get(sensorKey))
            .filter(Boolean)
            .sort(sortSensorStates);
    }, []);

    const syncVisibleSensorViews = useCallback(() => {
        activeSensorKeysRef.current = resolveVisibleSensorKeys(sensorRuntimesRef.current);
        const visibleSensorStates = getVisibleSensorStates();
        return visibleSensorStates;
    }, [getVisibleSensorStates]);

    const resetSensorTracking = useCallback(() => {
        sensorRuntimesRef.current.forEach((sensorState) => {
            sensorState.estimator?.reset?.();
        });
        sensorRuntimesRef.current.clear();
        activeSensorKeysRef.current = [];
        setCurrentHeight(0);
        setStabilityScore(100);
    }, []);

    const buildSessionSummary = useCallback(() => {
        const cadenceFromReps = sessionTime > 0 ? Math.round((reps / sessionTime) * 60) : 0;
        const completionRatio = totalReps > 0 ? Math.min(1, reps / totalReps) : 0;
        const derivedQualityScore = Math.round(Math.max(0, Math.min(100, (stabilityScore * 0.6) + (completionRatio * 40))));

        return {
            total_steps: Number.isFinite(sessionMetrics?.total_steps) ? sessionMetrics.total_steps : reps,
            avg_speed_mps: Number.isFinite(sessionMetrics?.avg_speed_mps) ? sessionMetrics.avg_speed_mps : null,
            cadence_spm: Number.isFinite(sessionMetrics?.cadence_spm) ? sessionMetrics.cadence_spm : cadenceFromReps,
            avg_step_length_m: Number.isFinite(sessionMetrics?.avg_step_length_m) ? sessionMetrics.avg_step_length_m : null,
            avg_stride_length_m: Number.isFinite(sessionMetrics?.avg_stride_length_m) ? sessionMetrics.avg_stride_length_m : null,
            avg_clearance_m: Number.isFinite(sessionMetrics?.avg_clearance_m) ? sessionMetrics.avg_clearance_m : targetHeight / 100,
            symmetry_score: Number.isFinite(sessionMetrics?.symmetry_percent) ? sessionMetrics.symmetry_percent : derivedQualityScore,
        };
    }, [reps, sessionMetrics, sessionTime, stabilityScore, targetHeight, totalReps]);

    const buildSessionDetails = useCallback(() => {
        const goalProgressPercent = totalReps > 0 ? Math.round((reps / totalReps) * 100) : 0;

        return {
            red_line_hits: reps,
            target_reps: totalReps,
            target_height_cm: targetHeight,
            goal_progress_percent: Math.max(0, Math.min(100, goalProgressPercent)),
            stability_score: stabilityScore,
        };
    }, [reps, stabilityScore, targetHeight, totalReps]);

    const { endSessionIfActive } = usePersistedGatewaySession({
        wsRef,
        userId: user?.uid,
        isConnected,
        shouldStart: gameState === GAME_STATES.PLAYING,
        shouldComplete: gameState === GAME_STATES.COMPLETED,
        sessionType: 'high_stepper',
        buildSummary: buildSessionSummary,
        buildDetails: buildSessionDetails,
        metadata: {
            game_label: 'High Stepper',
        },
    });

    // === WebSocket Connection ===
    useEffect(() => {
        manualDisconnectRef.current = false;

        const connectWebSocket = () => {
            try {
                wsRef.current = createRealtimeConnection();

                wsRef.current.onopen = () => {
                    console.log('🎮 High Stepper connected to WebSocket');
                    setIsConnected(true);
                };

                wsRef.current.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        handleSensorData(msg);
                    } catch (e) {
                        console.error('Parse error:', e);
                    }
                };

                wsRef.current.onclose = () => {
                    setIsConnected(false);
                    resetSensorTracking();

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
    }, [endSessionIfActive, resetSensorTracking]);

    // === Handle Sensor Data ===
    const handleSensorData = useCallback((msg) => {
        if (msg.type !== 'DATA') return;

        const sample = normalizeRealtimeSensorSample(msg.payload || {});
        const now = Date.now();

        if (!sample) {
            return;
        }

        let sensorState = sensorRuntimesRef.current.get(sample.sensorKey);
        if (!sensorState) {
            sensorState = createClearanceSensorRuntime(sample);
            sensorRuntimesRef.current.set(sample.sensorKey, sensorState);
        }

        sensorState.label = getRealtimeSensorLabel(sample);
        sensorState.side = sample.side || null;
        sensorState.sensorMount = sample.sensorMount || 'unknown';
        sensorState.lastSeenAt = now;
        sensorState.estimator?.setSensorMount?.(sensorState.sensorMount);

        const localLiftState = sensorState.estimator?.updateFromRawSample({
            raw_accel: sample.raw_accel,
            raw_gyro: sample.raw_gyro,
            timestamp_ms: sample.timestamp_ms,
            sensor_mount: sensorState.sensorMount,
        });

        const positionSource = Array.isArray(localLiftState?.position)
            ? localLiftState.position
            : sample?.position;

        const gatewayPositionZCm = Array.isArray(positionSource)
            ? Number(positionSource[2]) * 100 * sensitivity
            : null;
        const hasGatewayLift = Number.isFinite(gatewayPositionZCm);

        if (hasGatewayLift) {
            const adjustedHeight = Math.min(MAX_SCALE_HEIGHT, Math.max(0, gatewayPositionZCm));
            const gatewayIsStance = typeof localLiftState?.is_stance === 'boolean'
                ? localLiftState.is_stance
                : Boolean(sample?.is_stance);

            sensorState.currentHeight = gatewayIsStance
                ? 0
                : (GATEWAY_HEIGHT_ALPHA * adjustedHeight) + ((1 - GATEWAY_HEIGHT_ALPHA) * sensorState.currentHeight);
            sensorState.isStance = gatewayIsStance;

            if (sample?.gait_metrics?.stability_score !== undefined) {
                sensorState.stabilityScore = Math.round(sample.gait_metrics.stability_score);
            } else {
                const localGyroNorm = Number.isFinite(localLiftState?.gyro_norm) ? localLiftState.gyro_norm : 0;
                const stabilityPenalty = (localGyroNorm * 28) + (Math.abs(adjustedHeight - targetHeight) * 0.8);
                sensorState.stabilityScore = Math.max(0, Math.min(100, Math.round(100 - stabilityPenalty)));
            }

            const visibleSensorStates = syncVisibleSensorViews();
            const activeHeights = visibleSensorStates.map((visibleSensorState) => visibleSensorState.currentHeight || 0);
            const maxHeight = activeHeights.length ? Math.max(...activeHeights) : 0;
            const nextStabilityScore = visibleSensorStates.length
                ? Math.round(visibleSensorStates.reduce((total, visibleSensorState) => total + (visibleSensorState.stabilityScore || 0), 0) / visibleSensorStates.length)
                : 100;
            const repResetHeightCandidate = visibleSensorStates.length
                ? visibleSensorStates.every((visibleSensorState) => visibleSensorState.isStance || visibleSensorState.currentHeight < REP_RESET_THRESHOLD)
                : (gatewayIsStance || adjustedHeight < REP_RESET_THRESHOLD);

            setCurrentHeight(maxHeight);
            setStabilityScore(nextStabilityScore);

            if (repResetHeightCandidate) {
                if (!repResetCandidateStartedAtRef.current) {
                    repResetCandidateStartedAtRef.current = now;
                }

                repResetEligibleRef.current = (now - repResetCandidateStartedAtRef.current) >= REP_REARM_HOLD_MS;
            } else {
                repResetCandidateStartedAtRef.current = null;
                repResetEligibleRef.current = false;
            }

            return;
        }
    }, [sensitivity, syncVisibleSensorViews, targetHeight]);

    // === Rep Counting Logic (State Machine) ===
    useEffect(() => {
        if (gameState !== GAME_STATES.PLAYING) return;

        if (repState === 'READY' && currentHeight >= targetHeight) {
            // Hit target! Count rep
            setRepState('HIT_TARGET');
            setReps(prev => prev + 1);

            // Haptic feedback
            if (vibrationEnabled && navigator.vibrate) {
                navigator.vibrate(50);
            }

            // Sound feedback
            if (soundEnabled) {
                playSuccessSound();
            }
        } else if (repState === 'HIT_TARGET' && repResetEligibleRef.current && currentHeight < REP_RESET_THRESHOLD) {
            // Re-arm only after the foot has been back down briefly to avoid double counts within one lift.
            setRepState('READY');
        }
    }, [currentHeight, repState, targetHeight, gameState, soundEnabled, vibrationEnabled]);

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

    // === Play Success Sound ===
    const playSuccessSound = () => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance('ดี');
            utterance.lang = 'th-TH';
            utterance.rate = 1.5;
            utterance.volume = 0.5;
            window.speechSynthesis.speak(utterance);
        }
    };

    // === Format Time ===
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // === Game Controls ===
    const startSession = () => {
        setGameState(GAME_STATES.PLAYING);
        setCurrentHeight(0);
        setReps(0);
        setSessionTime(0);
        setRepState('READY');
        repResetCandidateStartedAtRef.current = null;
        repResetEligibleRef.current = false;
        setSessionMetrics({});
        resetSensorTracking();
    };

    const pauseSession = () => {
        setGameState(GAME_STATES.PAUSED);
    };

    const resumeSession = () => {
        setGameState(GAME_STATES.PLAYING);
    };

    const stopSession = () => {
        setGameState(GAME_STATES.COMPLETED);
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
    };

    const goToNextGame = () => {
        navigate('/game/balance');
    };

    const resetSession = () => {
        setGameState(GAME_STATES.READY);
        setReps(0);
        setSessionTime(0);
        setCurrentHeight(0);
        setRepState('READY');
        repResetCandidateStartedAtRef.current = null;
        repResetEligibleRef.current = false;
        setSessionMetrics({});
        resetSensorTracking();
    };

    // === Get Gauge Colors ===
    const getGaugeColor = () => {
        switch (gaugeState) {
            case 'SUCCESS':
                return 'bg-emerald-500';
            case 'APPROACHING':
                return 'bg-amber-400';
            default:
                return 'bg-blue-400';
        }
    };

    const getGaugeGlow = () => {
        if (gaugeState === 'SUCCESS') {
            return 'shadow-[0_0_30px_rgba(16,185,129,0.6)]';
        }
        return '';
    };

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
                    {/* <h1 className="text-xl sm:text-2xl font-extrabold text-gray-800">High Step</h1>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium">Knee Lift Training</p> */}
                </div>

                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-colors"
                >
                    <Settings className="w-5 h-5 text-blue-600" />
                </button>
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

                        {/* Target Height */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                ความสูงเป้าหมาย: <span className="text-blue-600 font-bold">{targetHeight} cm</span>
                            </label>
                            <input
                                type="range"
                                min="5"
                                max="30"
                                value={targetHeight}
                                onChange={(e) => setTargetHeight(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>5 cm</span>
                                <span>30 cm</span>
                            </div>
                        </div>

                        {/* Sensitivity */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                ความไว: <span className="text-blue-600 font-bold">{sensitivity.toFixed(1)}x</span>
                            </label>
                            <input
                                type="range"
                                min="0.5"
                                max="2"
                                step="0.1"
                                value={sensitivity}
                                onChange={(e) => setSensitivity(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        {/* Total Reps Goal */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                จำนวนครั้งเป้าหมาย: <span className="text-blue-600 font-bold">{totalReps}</span>
                            </label>
                            <input
                                type="range"
                                min="5"
                                max="50"
                                step="5"
                                value={totalReps}
                                onChange={(e) => setTotalReps(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        {/* Sound & Vibration */}
                        <div className="flex gap-4">
                            <button
                                onClick={() => setSoundEnabled(!soundEnabled)}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${soundEnabled ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                                    }`}
                            >
                                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                                <span className="text-sm font-medium">เสียง</span>
                            </button>
                            <button
                                onClick={() => setVibrationEnabled(!vibrationEnabled)}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${vibrationEnabled ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                                    }`}
                            >
                                <Vibrate className="w-5 h-5" />
                                <span className="text-sm font-medium">สั่น</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 p-4 lg:p-12 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">

                {/* LEFT: Capsule Gauge (Visual) */}
                <div className="flex justify-center items-end" style={{ height: '70vh', minHeight: '500px' }}>
                    <div className="relative h-full w-full max-w-sm mx-auto flex justify-center">
                        {/* Scale Markers */}
                        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between py-4 text-sm font-bold text-gray-400">
                            {[30, 25, 20, 15, 10, 5, 0].map(val => (
                                <span key={val} className="relative">
                                    {val}
                                    <span className="absolute left-6 top-1/2 w-4 h-[2px] bg-gray-200"></span>
                                </span>
                            ))}
                        </div>

                        {/* Gauge Container (Capsule) */}
                        <div className={`relative w-32 lg:w-40 h-full bg-gray-100/50 rounded-full overflow-hidden border-8 border-white shadow-2xl ${getGaugeGlow()} transition-all duration-300 ml-12`}>
                            {/* Background Grid */}
                            <div className="absolute inset-0 opacity-10"
                                style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px)', backgroundSize: '100% 10%' }}>
                            </div>

                            {/* Baseline Line (5cm) */}
                            <div
                                className="absolute left-0 right-0 border-t-2 border-dashed border-gray-400 z-10 opacity-60"
                                style={{ bottom: `${(BASELINE_HEIGHT / MAX_SCALE_HEIGHT) * 100}%` }}
                            >
                                <span className="absolute -left-16 -top-2.5 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                    FLOOR
                                </span>
                            </div>

                            {/* Target Line */}
                            <div
                                className="absolute left-0 right-0 border-t-4 border-dashed border-red-500 z-20 group"
                                style={{ bottom: `${targetLinePercent}%` }}
                            >
                                <span className="absolute -right-28 -top-4 text-sm font-bold text-white bg-red-500 px-3 py-1 rounded shadow-lg">
                                    TARGET {targetHeight}cm
                                </span>
                            </div>

                            {/* Liquid Fill */}
                            <div
                                className={`absolute bottom-0 left-0 right-0 transition-all duration-150 ease-out ${getGaugeColor()}`}
                                style={{
                                    height: `${displayHeightPercent}%`,
                                    opacity: gaugeState === 'IDLE' ? 0.9 : 1
                                }}
                            >
                                {/* Bubble effect */}
                                <div className="absolute inset-0 overflow-hidden">
                                    <div className="absolute w-4 h-4 bg-white/20 rounded-full animate-bounce" style={{ left: '20%', top: '30%' }}></div>
                                    <div className="absolute w-6 h-6 bg-white/10 rounded-full animate-bounce" style={{ left: '60%', top: '50%', animationDelay: '0.3s' }}></div>
                                </div>
                                {/* Top Edge Highlight */}
                                <div className="absolute top-0 left-0 right-0 h-2 bg-white/30"></div>
                            </div>

                            {/* Glass reflection */}
                            <div className="absolute top-0 left-2 w-4 h-[90%] bg-gradient-to-r from-white/40 to-transparent rounded-full z-30"></div>
                        </div>

                        {/* Current Height Float */}
                        <div className="absolute right-0 lg:-right-12 top-1/2 -translate-y-1/2 z-40">
                            <div className={`bg-white rounded-3xl shadow-xl p-4 transition-all duration-200 border-2 flex flex-col items-center justify-center ${gaugeState === 'SUCCESS' ? 'border-emerald-400 scale-110' : 'border-white'}`}>
                                <div className="text-sm text-gray-400 mb-1 font-bold uppercase tracking-wide text-center">Current Height</div>
                                <div className={`text-5xl font-black tabular-nums ${gaugeState === 'SUCCESS' ? 'text-emerald-500' :
                                    gaugeState === 'APPROACHING' ? 'text-amber-500' :
                                        'text-blue-500'
                                    }`}>
                                    {Math.floor(currentHeight)}
                                    <span className="text-xl text-gray-400 ml-1">.{Math.round((currentHeight % 1) * 10)} cm</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Dashboard (Controls & Stats) */}
                <div className="flex flex-col gap-8 w-full">

                    {/* Timer & Reps (Desktop) */}
                    <div className="bg-white rounded-[2rem] shadow-xl p-6 lg:p-8 relative overflow-hidden">
                        {/* Gradient Header Removed for cleaner look */}

                        <div className="flex justify-between items-end mb-6">
                            <div>
                                <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">Time Elapsed</div>
                                <div className="text-4xl lg:text-6xl font-black text-gray-800 tabular-nums">{formatTime(sessionTime)}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">Set Progress</div>
                                <div className="text-3xl lg:text-4xl font-black text-blue-600">
                                    {reps}<span className="text-gray-300 text-2xl"> / {totalReps}</span>
                                </div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500 ease-out"
                                style={{ width: `${(reps / totalReps) * 100}%` }}></div>
                        </div>
                        <div className="mt-2 text-right text-sm font-bold text-gray-400">{Math.round((reps / totalReps) * 100)}% Complete</div>
                    </div>

                    {/* Stats Grid */}
                    <div className="hidden lg:grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-3xl shadow-lg p-5 flex flex-col items-center justify-center">
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">Stability Score</div>
                            <div className={`text-4xl lg:text-5xl font-black ${stabilityScore >= 80 ? 'text-emerald-500' : stabilityScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                {stabilityScore}%
                            </div>
                            <div className="mt-2 text-xs font-bold px-2 py-1 bg-gray-100 rounded text-gray-500">
                                {stabilityScore >= 80 ? 'Excellent' : 'Needs Focus'}
                            </div>
                        </div>

                        <div className="bg-white rounded-3xl shadow-lg p-5 flex flex-col items-center justify-center">
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">Target</div>
                            <div className="text-4xl lg:text-5xl font-black text-gray-800">
                                {targetHeight}<span className="text-2xl text-gray-400">cm</span>
                            </div>
                            <div className="mt-2 text-xs font-bold text-blue-500 cursor-pointer hover:underline" onClick={() => setShowSettings(true)}>
                                Adjust Settings
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="grid grid-cols-2 gap-4 mt-auto">
                        {gameState === GAME_STATES.READY && (
                            <button onClick={startSession} className="col-span-2 py-6 bg-blue-600 hover:bg-blue-700 text-white font-black text-xl rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3">
                                <Play className="w-8 h-8" /> START TRAINING
                            </button>
                        )}

                        {gameState === GAME_STATES.PLAYING && (
                            <>
                                <button onClick={pauseSession} className="py-6 bg-amber-400 hover:bg-amber-500 text-white font-bold text-xl rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                    <Pause className="w-6 h-6" /> PAUSE
                                </button>
                                <button onClick={stopSession} className="py-6 bg-red-500 hover:bg-red-600 text-white font-bold text-xl rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                    <Square className="w-6 h-6" /> STOP
                                </button>
                            </>
                        )}

                        {gameState === GAME_STATES.PAUSED && (
                            <>
                                <button onClick={resumeSession} className="py-6 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xl rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                    <Play className="w-6 h-6" /> RESUME
                                </button>
                                <button onClick={stopSession} className="py-6 bg-red-500 hover:bg-red-600 text-white font-bold text-xl rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                    <Square className="w-6 h-6" /> STOP
                                </button>
                            </>
                        )}

                        {gameState === GAME_STATES.COMPLETED && (
                            <button onClick={resetSession} className="col-span-2 py-6 bg-blue-600 hover:bg-blue-700 text-white font-black text-xl rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3">
                                <Play className="w-8 h-8" /> NEW SESSION
                            </button>
                        )}
                    </div>

                    <button
                        onClick={goToNextGame}
                        className="w-full py-4 border-2 border-blue-200 bg-white hover:bg-blue-50 text-blue-700 font-black text-lg rounded-2xl shadow-lg transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                    >
                        <span>Next: Magic Plate</span>
                        <ArrowRight className="w-5 h-5" />
                    </button>

                </div>
            </main>
        </div>
    );
};

export default GameClearance;
