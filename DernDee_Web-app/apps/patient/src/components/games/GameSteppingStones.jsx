import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAIT_ALGORITHM_VERSION } from '@shared/gait/gaitRuntimeConfig.js';
import { toSessionMetricsFromSummary } from '@shared/gait/gaitRuntimeUtils.js';
import { createSharedGaitRuntime } from '@shared/gait/sharedGaitRuntime.js';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { createRealtimeConnection } from '@shared/gateway/realtimeTransport.js';
import { normalizeRealtimeSensorSample } from '@shared/gateway/realtimeSensorUtils.js';
import { usePersistedGatewaySession } from '@shared/hooks/usePersistedGatewaySession.js';
import {
    ArrowLeft,
    Footprints,
    Pause,
    Play,
    Settings,
    Square,
    Volume2,
    VolumeX,
    X,
} from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

import './GameSteppingStones.css';

const GAME_STATES = {
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
};

const DEFAULT_TARGET_STEP_CM = 35;
const DEFAULT_TOTAL_TARGETS = 10;
const MIN_TARGET_STEP_CM = 20;
const MAX_TARGET_STEP_CM = 60;
const LANDING_HOLD_MS = 900;
const LANDING_TIMEOUT_MS = 2600;
const STEP_SUCCESS_RATIO = 0.92;
const STEP_NEAR_RATIO = 0.75;
const LANDING_STABLE_GYRO_NORM = 0.24;
const LANDING_STABLE_TILT_RATE = 1.4;
const FEEDBACK_RESET_MS = 950;
const SAFE_TARGET_THRESHOLD_CM = 35;

// 3 stones — mobile & iPad portrait (< 1024 px)
const STONE_SLOT_LAYOUT_SMALL = [
    { left: '50%', bottom: '10%', scale: 1.10 },
    { left: '52%', bottom: '42%', scale: 0.92 },
    { left: '49%', bottom: '74%', scale: 0.78 },
];

// 4 stones — desktop / MacBook (≥ 1024 px)
const STONE_SLOT_LAYOUT_LARGE = [
    { left: '50%', bottom: '8%',  scale: 1.08 },
    { left: '52%', bottom: '33%', scale: 0.94 },
    { left: '49%', bottom: '58%', scale: 0.82 },
    { left: '53%', bottom: '75%', scale: 0.70 },
];

const WATER_SCENERY = [
    { type: 'pebble', left: '9%', top: '38%', scale: 1.0 },
    { type: 'reeds', left: '88%', top: '24%', scale: 1.0 },
    { type: 'pebbles', left: '92%', top: '31%', scale: 1.0 },
    { type: 'lily', left: '86%', top: '56%', scale: 1.0 },
    { type: 'reeds', left: '7%', top: '70%', scale: 0.9 },
    { type: 'pebbles', left: '5%', top: '79%', scale: 0.95 },
    { type: 'lily', left: '13%', top: '84%', scale: 0.72 },
];

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatMetricNumber(value, digits = 0, fallback = '--') {
    return Number.isFinite(value) ? value.toFixed(digits) : fallback;
}

function formatPercent(value) {
    return Number.isFinite(value) ? `${Math.round(value)}%` : '--';
}

function getFeedbackToneClasses(tone) {
    switch (tone) {
        case 'emerald':
            return 'bg-emerald-500 text-white shadow-lg';
        case 'amber':
            return 'bg-amber-400 text-amber-900 shadow-lg';
        case 'red':
            return 'bg-red-500 text-white shadow-lg';
        default:
            return 'bg-white text-emerald-600 shadow-lg';
    }
}

function getWeightShiftLabel(weightShiftPercent) {
    if (!Number.isFinite(weightShiftPercent)) {
        return 'Waiting';
    }

    if (weightShiftPercent >= 85) {
        return 'Good';
    }

    if (weightShiftPercent >= 55) {
        return 'Loading';
    }

    return 'Build hold';
}

const GameSteppingStones = () => {
    const navigate = useNavigate();
    const { user } = useUserAuth();

    const [gameState, setGameState] = useState(GAME_STATES.READY);
    const [showSettings, setShowSettings] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [targetStepCm, setTargetStepCm] = useState(DEFAULT_TARGET_STEP_CM);
    const [totalTargets, setTotalTargets] = useState(DEFAULT_TOTAL_TARGETS);
    const [sessionTime, setSessionTime] = useState(0);
    const [completedTargets, setCompletedTargets] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [sessionMetrics, setSessionMetrics] = useState({});
    const [currentStrideCm, setCurrentStrideCm] = useState(null);
    const [currentStepCm, setCurrentStepCm] = useState(null);
    const [weightShiftPercent, setWeightShiftPercent] = useState(null);
    const [landingStoneNumber, setLandingStoneNumber] = useState(null);
    const [visibleSensors, setVisibleSensors] = useState([]);
    const [isJumping, setIsJumping] = useState(false);
    const [isWideScreen, setIsWideScreen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
    const [feedback, setFeedback] = useState({
        text: 'Step to the green stone',
        tone: 'sky',
        key: 1,
    });

    const wsRef = useRef(null);
    const audioContextRef = useRef(null);
    const gameStateRef = useRef(GAME_STATES.READY);
    const targetStepCmRef = useRef(DEFAULT_TARGET_STEP_CM);
    const totalTargetsRef = useRef(DEFAULT_TOTAL_TARGETS);
    const completedTargetsRef = useRef(0);
    const manualDisconnectRef = useRef(false);
    const gaitRuntimeRef = useRef(null);
    const sessionTimerRef = useRef(null);
    const feedbackResetTimerRef = useRef(null);
    const jumpTimerRef = useRef(null);
    const handleSensorDataRef = useRef(null);
    const weightShiftPercentRef = useRef(null);
    const activeLandingRef = useRef(null);

    useEffect(() => {
        gameStateRef.current = gameState;
    }, [gameState]);

    useEffect(() => {
        targetStepCmRef.current = targetStepCm;
    }, [targetStepCm]);

    useEffect(() => {
        totalTargetsRef.current = totalTargets;
    }, [totalTargets]);

    useEffect(() => {
        completedTargetsRef.current = completedTargets;
    }, [completedTargets]);

    useEffect(() => {
        weightShiftPercentRef.current = weightShiftPercent;
    }, [weightShiftPercent]);

    const pushFeedback = useCallback((text, tone = 'sky') => {
        setFeedback((previousFeedback) => {
            if (previousFeedback.text === text && previousFeedback.tone === tone) {
                return previousFeedback;
            }

            return {
                text,
                tone,
                key: previousFeedback.key + 1,
            };
        });
    }, []);

    const updateWeightShiftPercent = useCallback((nextPercent) => {
        const normalizedPercent = Number.isFinite(nextPercent)
            ? Math.max(0, Math.min(100, Math.round(nextPercent)))
            : null;

        if (weightShiftPercentRef.current === normalizedPercent) {
            return;
        }

        if (
            normalizedPercent !== null
            && weightShiftPercentRef.current !== null
            && Math.abs(normalizedPercent - weightShiftPercentRef.current) < 3
            && normalizedPercent !== 100
            && normalizedPercent !== 0
        ) {
            return;
        }

        weightShiftPercentRef.current = normalizedPercent;
        setWeightShiftPercent(normalizedPercent);
    }, []);

    const playLandingSound = useCallback(() => {
        if (!soundEnabled || !audioContextRef.current) {
            return;
        }

        const context = audioContextRef.current;
        const startTime = context.currentTime;

        const baseOscillator = context.createOscillator();
        const accentOscillator = context.createOscillator();
        const gainNode = context.createGain();

        baseOscillator.connect(gainNode);
        accentOscillator.connect(gainNode);
        gainNode.connect(context.destination);

        baseOscillator.type = 'triangle';
        accentOscillator.type = 'sine';
        baseOscillator.frequency.setValueAtTime(587.33, startTime);
        accentOscillator.frequency.setValueAtTime(880, startTime);

        gainNode.gain.setValueAtTime(0.001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.28, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.22);

        baseOscillator.start(startTime);
        accentOscillator.start(startTime + 0.01);
        baseOscillator.stop(startTime + 0.24);
        accentOscillator.stop(startTime + 0.24);
    }, [soundEnabled]);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const handler = (e) => setIsWideScreen(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();

        return () => {
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    const collectGaitMetricsRows = useCallback(() => {
        return gaitRuntimeRef.current?.collectGaitMetricsRows?.() || [];
    }, []);

    const clearLandingState = useCallback(() => {
        activeLandingRef.current = null;
        setLandingStoneNumber(null);
    }, []);

    const resetMissionUi = useCallback(() => {
        clearLandingState();
        updateWeightShiftPercent(null);
        setCurrentStrideCm(null);
        setCurrentStepCm(null);
        completedTargetsRef.current = 0;
        setCompletedTargets(0);
        setSessionTime(0);
        setIsJumping(false);
        setSessionMetrics({});
        pushFeedback('Step to the green stone', 'sky');
    }, [clearLandingState, pushFeedback, updateWeightShiftPercent]);

    const handleSuccessfulLanding = useCallback(() => {
        const landingState = activeLandingRef.current;
        if (!landingState) {
            return;
        }

        clearLandingState();
        updateWeightShiftPercent(100);
        playLandingSound();
        setIsJumping(true);

        if (jumpTimerRef.current) {
            clearTimeout(jumpTimerRef.current);
        }
        jumpTimerRef.current = setTimeout(() => {
            setIsJumping(false);
        }, 450);

        setCompletedTargets((previousCompletedTargets) => {
            const nextCompletedTargets = previousCompletedTargets + 1;
            const missionComplete = nextCompletedTargets >= totalTargetsRef.current;
            completedTargetsRef.current = nextCompletedTargets;

            if (feedbackResetTimerRef.current) {
                clearTimeout(feedbackResetTimerRef.current);
                feedbackResetTimerRef.current = null;
            }

            if (missionComplete) {
                pushFeedback('Great control', 'emerald');
                setGameState(GAME_STATES.COMPLETED);
                gameStateRef.current = GAME_STATES.COMPLETED;
            } else {
                pushFeedback('Perfect Landing', 'emerald');
                feedbackResetTimerRef.current = setTimeout(() => {
                    if (gameStateRef.current === GAME_STATES.PLAYING) {
                        updateWeightShiftPercent(null);
                        pushFeedback('Step to the green stone', 'sky');
                    }
                }, FEEDBACK_RESET_MS);
            }

            return nextCompletedTargets;
        });
    }, [clearLandingState, playLandingSound, pushFeedback, updateWeightShiftPercent]);

    const advanceLandingState = useCallback((sensorKey) => {
        const landingState = activeLandingRef.current;
        if (!landingState || landingState.sensorKey !== sensorKey || gameStateRef.current !== GAME_STATES.PLAYING) {
            return;
        }

        const stability = gaitRuntimeRef.current?.getStability(sensorKey);
        const now = performance.now();
        const isStableStance = stability?.isStable
            && (stability?.gyroNorm ?? Infinity) <= LANDING_STABLE_GYRO_NORM
            && Math.abs(stability?.tiltRate ?? 0) <= LANDING_STABLE_TILT_RATE;

        if (isStableStance) {
            if (!landingState.stableStartedAtMs) {
                landingState.stableStartedAtMs = now;
            }

            const progressRatio = Math.min(1, (now - landingState.stableStartedAtMs) / LANDING_HOLD_MS);
            updateWeightShiftPercent(progressRatio * 100);

            if (progressRatio >= 1) {
                handleSuccessfulLanding();
            }
            return;
        }

        landingState.stableStartedAtMs = null;
        updateWeightShiftPercent(Math.max(0, (weightShiftPercentRef.current ?? 0) - 5));

        if (now - landingState.startedAtMs >= 350) {
            pushFeedback('Hold balance', 'amber');
        }

        if (now - landingState.startedAtMs > LANDING_TIMEOUT_MS) {
            clearLandingState();
            updateWeightShiftPercent(null);
            pushFeedback('Step to the green stone', 'sky');
        }
    }, [clearLandingState, handleSuccessfulLanding, pushFeedback, updateWeightShiftPercent]);

    const handleStepMetrics = useCallback((sensorKey, params) => {
        if (!params || gameStateRef.current !== GAME_STATES.PLAYING) {
            return;
        }

        const strideLengthCm = Number.isFinite(params.strideLength) ? params.strideLength * 100 : null;
        const stepLengthCm = Number.isFinite(params.stepLength) ? params.stepLength * 100 : null;

        setCurrentStrideCm(strideLengthCm);
        setCurrentStepCm(stepLengthCm);

        if (!Number.isFinite(stepLengthCm) || completedTargetsRef.current >= totalTargetsRef.current) {
            return;
        }

        if (activeLandingRef.current) {
            return;
        }

        if (stepLengthCm >= targetStepCmRef.current * STEP_SUCCESS_RATIO) {
            activeLandingRef.current = {
                sensorKey,
                side: params.side,
                cycleKey: params.cycleKey,
                startedAtMs: performance.now(),
                stableStartedAtMs: null,
                stepLengthCm,
                strideLengthCm,
            };
            setLandingStoneNumber(completedTargetsRef.current + 2);
            updateWeightShiftPercent(0);
            pushFeedback('Shift weight', 'emerald');
            return;
        }

        updateWeightShiftPercent(null);
        if (stepLengthCm >= targetStepCmRef.current * STEP_NEAR_RATIO) {
            pushFeedback('Almost there', 'sky');
        } else {
            pushFeedback('Try a longer step', 'amber');
        }

        if (feedbackResetTimerRef.current) {
            clearTimeout(feedbackResetTimerRef.current);
        }
        feedbackResetTimerRef.current = setTimeout(() => {
            if (gameStateRef.current === GAME_STATES.PLAYING && !activeLandingRef.current) {
                pushFeedback('Step to the green stone', 'sky');
            }
        }, FEEDBACK_RESET_MS);
    }, [pushFeedback, updateWeightShiftPercent]);

    const resetDerivedAnalysis = useCallback(() => {
        gaitRuntimeRef.current?.reset();
        setVisibleSensors([]);
        setSessionMetrics({});
        clearLandingState();
    }, [clearLandingState]);

    const buildSessionSummary = useCallback(() => {
        const missionProgress = totalTargetsRef.current > 0
            ? Math.round((completedTargets / totalTargetsRef.current) * 100)
            : 0;

        return {
            total_steps: Number.isFinite(sessionMetrics?.total_steps) ? sessionMetrics.total_steps : completedTargets,
            avg_speed_mps: Number.isFinite(sessionMetrics?.avg_speed_mps) ? sessionMetrics.avg_speed_mps : null,
            cadence_spm: Number.isFinite(sessionMetrics?.cadence_spm) ? sessionMetrics.cadence_spm : 0,
            avg_step_length_m: Number.isFinite(sessionMetrics?.avg_step_length_m) ? sessionMetrics.avg_step_length_m : null,
            avg_stride_length_m: Number.isFinite(sessionMetrics?.avg_stride_length_m) ? sessionMetrics.avg_stride_length_m : null,
            avg_clearance_m: Number.isFinite(sessionMetrics?.avg_clearance_m) ? sessionMetrics.avg_clearance_m : null,
            symmetry_score: missionProgress,
        };
    }, [completedTargets, sessionMetrics]);

    const buildSessionDetails = useCallback(() => {
        const progressPercent = totalTargetsRef.current > 0
            ? Math.round((completedTargets / totalTargetsRef.current) * 100)
            : 0;

        return {
            target_step_cm: targetStepCmRef.current,
            completed_landings: completedTargets,
            target_landings: totalTargetsRef.current,
            progress_percent: Math.max(0, Math.min(100, progressPercent)),
            safe_easy_mode: targetStepCmRef.current <= SAFE_TARGET_THRESHOLD_CM,
            analysis_source: 'shared_gait_runtime',
            algorithm_version: GAIT_ALGORITHM_VERSION,
        };
    }, [completedTargets]);

    const { endSessionIfActive } = usePersistedGatewaySession({
        wsRef,
        userId: user?.uid,
        isConnected,
        shouldStart: gameState === GAME_STATES.PLAYING,
        shouldComplete: gameState === GAME_STATES.COMPLETED,
        sessionType: 'stepping_stones',
        buildSummary: buildSessionSummary,
        buildDetails: buildSessionDetails,
        buildGaitMetricsRows: collectGaitMetricsRows,
        metadata: {
            game_label: 'Stepping Stones',
        },
    });

    const handleSensorData = useCallback((msg) => {
        if (msg.type !== 'DATA') {
            return;
        }

        const sample = normalizeRealtimeSensorSample(msg.payload || {});
        if (!sample) {
            return;
        }

        gaitRuntimeRef.current?.ingestSample(sample);

        if (gameStateRef.current !== GAME_STATES.PLAYING) {
            return;
        }

        if (!gaitRuntimeRef.current?.getVisibleSensorKeys().includes(sample.sensorKey)) {
            return;
        }

        advanceLandingState(sample.sensorKey);
    }, [advanceLandingState]);

    useEffect(() => {
        handleSensorDataRef.current = handleSensorData;
    }, [handleSensorData]);

    useEffect(() => {
        manualDisconnectRef.current = false;
        resetDerivedAnalysis();

        const connectWebSocket = () => {
            try {
                wsRef.current = createRealtimeConnection();

                wsRef.current.onopen = () => {
                    setIsConnected(true);
                };

                wsRef.current.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        handleSensorDataRef.current?.(message);
                    } catch (error) {
                        console.error('Parse error:', error);
                    }
                };

                wsRef.current.onclose = () => {
                    setIsConnected(false);
                    resetDerivedAnalysis();

                    if (manualDisconnectRef.current) {
                        return;
                    }

                    setTimeout(connectWebSocket, 3000);
                };

                wsRef.current.onerror = (error) => {
                    console.error('WebSocket error:', error);
                };
            } catch (error) {
                console.error('WebSocket connection error:', error);
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
    }, [endSessionIfActive, resetDerivedAnalysis]);

    useEffect(() => {
        const runtime = createSharedGaitRuntime({
            enableSessionAnalyzer: true,
            enableStanceStability: true,
        });
        gaitRuntimeRef.current = runtime;

        const unsubscribeParams = runtime.onParams(({ sensorKey, params }) => {
            if (!params || gameStateRef.current !== GAME_STATES.PLAYING) {
                return;
            }

            if (!runtime.getVisibleSensorKeys().includes(sensorKey)) {
                return;
            }

            handleStepMetrics(sensorKey, params);
        });

        const unsubscribeSummary = runtime.onSummary((summary) => {
            setSessionMetrics(toSessionMetricsFromSummary(summary));
        });

        const unsubscribeVisibility = runtime.onVisibilityChange(({ visibleStates }) => {
            setVisibleSensors(visibleStates.map((sensorState) => ({
                key: sensorState.sensorKey,
                label: sensorState.label,
                side: sensorState.side,
            })));
        });

        runtime.startAnalysisLoop();

        return () => {
            unsubscribeParams();
            unsubscribeSummary();
            unsubscribeVisibility();
            runtime.stopAnalysisLoop();
            runtime.destroy();
            gaitRuntimeRef.current = null;

            if (feedbackResetTimerRef.current) {
                clearTimeout(feedbackResetTimerRef.current);
            }
            if (jumpTimerRef.current) {
                clearTimeout(jumpTimerRef.current);
            }
        };
    }, [handleStepMetrics]);

    useEffect(() => {
        if (gameState !== GAME_STATES.PLAYING) {
            if (sessionTimerRef.current) {
                clearInterval(sessionTimerRef.current);
                sessionTimerRef.current = null;
            }
            return;
        }

        sessionTimerRef.current = setInterval(() => {
            setSessionTime((previousTime) => previousTime + 1);
        }, 1000);

        return () => {
            if (sessionTimerRef.current) {
                clearInterval(sessionTimerRef.current);
                sessionTimerRef.current = null;
            }
        };
    }, [gameState]);

    const startSession = () => {
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }

        if (feedbackResetTimerRef.current) {
            clearTimeout(feedbackResetTimerRef.current);
            feedbackResetTimerRef.current = null;
        }

        gameStateRef.current = GAME_STATES.PLAYING;
        setGameState(GAME_STATES.PLAYING);
        resetMissionUi();
        resetDerivedAnalysis();
    };

    const pauseSession = () => {
        gameStateRef.current = GAME_STATES.PAUSED;
        setGameState(GAME_STATES.PAUSED);
        pushFeedback('Mission paused', 'amber');
    };

    const resumeSession = () => {
        gameStateRef.current = GAME_STATES.PLAYING;
        setGameState(GAME_STATES.PLAYING);
        pushFeedback('Step to the green stone', 'sky');
    };

    const stopSession = () => {
        clearLandingState();
        updateWeightShiftPercent(null);
        gameStateRef.current = GAME_STATES.COMPLETED;
        setGameState(GAME_STATES.COMPLETED);
        pushFeedback('Session stopped', 'amber');
    };

    const resetSession = () => {
        gameStateRef.current = GAME_STATES.READY;
        setGameState(GAME_STATES.READY);
        resetMissionUi();
        resetDerivedAnalysis();
    };

    const goBackToTherapy = () => {
        navigate('/therapy');
    };

    const currentStoneNumber = completedTargets + 1;
    const targetStoneNumber = completedTargets < totalTargets ? currentStoneNumber + 1 : null;
    const stoneSlotLayout = isWideScreen ? STONE_SLOT_LAYOUT_LARGE : STONE_SLOT_LAYOUT_SMALL;
    const maxVisibleStart = Math.max(1, (totalTargets + 1) - stoneSlotLayout.length + 1);
    const visibleStartStoneNumber = Math.min(currentStoneNumber, maxVisibleStart);
    const visibleStoneNumbers = stoneSlotLayout
        .map((_, index) => visibleStartStoneNumber + index)
        .filter((stoneNumber) => stoneNumber <= totalTargets + 1);
    const progressPercent = totalTargets > 0 ? Math.round((completedTargets / totalTargets) * 100) : 0;
    const displayStrideCm = Number.isFinite(currentStrideCm)
        ? currentStrideCm
        : (Number.isFinite(sessionMetrics?.avg_stride_length_m) ? sessionMetrics.avg_stride_length_m * 100 : null);
    const displayStepCm = Number.isFinite(currentStepCm)
        ? currentStepCm
        : (Number.isFinite(sessionMetrics?.avg_step_length_m) ? sessionMetrics.avg_step_length_m * 100 : null);
    const displayedStrideCm = Number.isFinite(displayStrideCm) ? Math.round(displayStrideCm) : 0;
    const displayedWeightBearing = Number.isFinite(weightShiftPercent) ? Math.round(weightShiftPercent) : 0;
    const midpointTarget = Math.max(1, Math.round(totalTargets / 2));
    const safeModeEnabled = targetStepCm <= SAFE_TARGET_THRESHOLD_CM;
    const primaryAction = gameState === GAME_STATES.PLAYING
        ? {
            icon: Pause,
            label: 'Pause',
            onClick: pauseSession,
            tone: 'amber',
        }
        : gameState === GAME_STATES.PAUSED
            ? {
                icon: Play,
                label: 'Resume',
                onClick: resumeSession,
                tone: 'amber',
            }
            : gameState === GAME_STATES.COMPLETED
                ? {
                    icon: Play,
                    label: 'Play Again',
                    onClick: startSession,
                    tone: 'amber',
                }
                : {
                    icon: Play,
                    label: 'Start',
                    onClick: startSession,
                    tone: 'amber',
                };
    const secondaryAction = (gameState === GAME_STATES.PLAYING || gameState === GAME_STATES.PAUSED)
        ? {
            icon: Square,
            label: 'Stop',
            onClick: stopSession,
            tone: 'red',
        }
        : {
            icon: ArrowLeft,
            label: 'Back',
            onClick: goBackToTherapy,
            tone: 'red',
        };
    const PrimaryActionIcon = primaryAction.icon;
    const SecondaryActionIcon = secondaryAction.icon;

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <button
                        onClick={goBackToTherapy}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <img src={derndeeLogo} alt="DernDee" className="h-10 sm:h-12 object-contain" />
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSoundEnabled((previousValue) => !previousValue)}
                        className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-colors"
                        aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}
                    >
                        {soundEnabled ? <Volume2 className="w-5 h-5 text-blue-600" /> : <VolumeX className="w-5 h-5 text-blue-600" />}
                    </button>
                    <button
                        onClick={() => setShowSettings((previousValue) => !previousValue)}
                        className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-colors"
                        aria-label="Open settings"
                    >
                        <Settings className="w-5 h-5 text-blue-600" />
                    </button>
                </div>
            </header>

            {/* Settings Panel */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="text-xl font-extrabold text-gray-800">Stepping Stones</h3>
                                <p className="text-sm text-gray-500 mt-1">ปรับระดับความท้าทายได้ที่นี่</p>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* Sensor status */}
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-5">
                            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                            <span className="font-medium">{isConnected ? 'Sensors connected' : 'Waiting for sensors'}</span>
                        </div>

                        {/* Target step reach */}
                        <div className="mb-5">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                ระยะก้าวเป้าหมาย: <span className="text-blue-600 font-bold">{targetStepCm} cm</span>
                            </label>
                            <input
                                type="range"
                                min={MIN_TARGET_STEP_CM}
                                max={MAX_TARGET_STEP_CM}
                                step="1"
                                value={targetStepCm}
                                onChange={(event) => setTargetStepCm(Number(event.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>ง่าย {MIN_TARGET_STEP_CM} cm</span>
                                <span>ท้าทาย {MAX_TARGET_STEP_CM} cm</span>
                            </div>
                        </div>

                        {/* Stone targets */}
                        <div className="mb-5">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                จำนวนก้อนหิน: <span className="text-blue-600 font-bold">{totalTargets}</span>
                            </label>
                            <input
                                type="range"
                                min="6"
                                max="14"
                                step="1"
                                value={totalTargets}
                                onChange={(event) => setTotalTargets(Number(event.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        {/* Presets */}
                        <div className="grid grid-cols-3 gap-2 mb-5">
                            {[
                                { label: 'ง่าย', step: 28, targets: 8 },
                                { label: 'มาตรฐาน', step: 35, targets: 10 },
                                { label: 'ท้าทาย', step: 44, targets: 12 },
                            ].map((preset) => (
                                <button
                                    key={preset.label}
                                    onClick={() => {
                                        setTargetStepCm(preset.step);
                                        setTotalTargets(preset.targets);
                                    }}
                                    className="py-2 text-sm rounded-xl bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700 font-medium transition-colors"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        {/* Safety note */}
                        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
                            ใช้ในพื้นที่โล่ง และควรมีจุดยึดเกาะใกล้มือหากยังไม่มั่นใจในการยืนขาเดียว
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button onClick={goBackToTherapy} className="flex-1 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors hover:bg-gray-300">
                                กลับ
                            </button>
                            <button onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl transition-colors hover:bg-blue-700">
                                ดำเนินการต่อ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex flex-col lg:flex-row lg:gap-8 lg:p-8 lg:max-w-7xl lg:mx-auto">
                {/* Stage (River scene) */}
                <section className="stepping-stones-stage-shell lg:flex-1">
                    <div className="stepping-stones-stage">
                        {!isConnected && (
                            <div className="stepping-stones-status-pill">
                                Waiting for sensors
                            </div>
                        )}

                        {/* Timer — visible on mobile/iPad only; desktop shows it in the right panel */}
                        <div className="stepping-stones-timer-wrap lg:hidden">
                            <div className="stepping-stones-timer">
                                {formatTime(sessionTime)}
                            </div>
                        </div>

                        {WATER_SCENERY.map((item, index) => (
                            <div
                                key={`${item.type}-${index}`}
                                className={`stepping-stones-scenery stepping-stones-scenery--${item.type}`}
                                style={{
                                    left: item.left,
                                    top: item.top,
                                    transform: `translate(-50%, -50%) scale(${item.scale})`,
                                }}
                            ></div>
                        ))}

                        {visibleStoneNumbers.map((stoneNumber, index) => {
                            const slot = stoneSlotLayout[index];
                            const isCurrentStone = stoneNumber === currentStoneNumber;
                            const isTargetStone = targetStoneNumber !== null && stoneNumber === targetStoneNumber;
                            const isLandingStone = landingStoneNumber === stoneNumber;
                            const isPastStone = stoneNumber < currentStoneNumber;

                            return (
                                <div
                                    key={stoneNumber}
                                    className="stepping-stones-stone-slot"
                                    style={{
                                        left: slot.left,
                                        bottom: slot.bottom,
                                        transform: `translateX(-50%) scale(${slot.scale})`,
                                    }}
                                >
                                    <div
                                        className={`stepping-stones-stone ${isPastStone ? 'stepping-stones-stone--passed' : ''} ${isCurrentStone ? 'stepping-stones-stone--current' : ''} ${isTargetStone ? 'stepping-stones-stone--target' : ''}`}
                                    >
                                        <div className="stepping-stones-stone-water-ring"></div>
                                        {(isLandingStone || (isCurrentStone && isJumping)) && <div className="stepping-stones-ripple"></div>}

                                        {isCurrentStone && (
                                            <div className={`stepping-stones-avatar stepping-stones-avatar--current ${isJumping ? 'stepping-stones-avatar--jumping' : ''}`}>
                                                <Footprints className="h-7 w-7" />
                                            </div>
                                        )}

                                        {isLandingStone && !isCurrentStone && (
                                            <div className="stepping-stones-avatar stepping-stones-avatar--landing">
                                                <Footprints className="h-6 w-6" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Right Panel */}
                <aside className="flex flex-col gap-4 p-4 lg:p-0 lg:w-96 xl:w-[440px]">
                    {/* Timer — desktop only, top of panel */}
                    <div className="hidden lg:flex items-center justify-between bg-white rounded-2xl shadow-xl px-5 py-3">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Time Elapsed</div>
                        <div className="text-3xl font-black text-gray-800 tabular-nums">{formatTime(sessionTime)}</div>
                    </div>

                    {/* Feedback badge */}
                    <div className="flex items-center justify-center min-h-[52px] -mt-6 lg:mt-0">
                        <div key={feedback.key} className={`stepping-stones-feedback px-7 py-3 rounded-full text-sm font-extrabold uppercase tracking-wide ${getFeedbackToneClasses(feedback.tone)}`}>
                            {feedback.text}
                        </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-2xl shadow-xl p-3 sm:p-4 flex flex-col items-center text-center">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Stride</div>
                            <div className="text-2xl font-black text-blue-600 tabular-nums leading-tight">
                                {displayedStrideCm}<span className="text-sm text-gray-400 ml-0.5">cm</span>
                            </div>
                            <div className="text-xs text-gray-400 font-medium mt-1">เป้า {targetStepCm} cm</div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-xl p-3 sm:p-4 flex flex-col items-center text-center">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Weight</div>
                            <div className="text-2xl font-black text-blue-600 tabular-nums leading-tight">{displayedWeightBearing}%</div>
                            <div className="text-xs font-bold px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 mt-1 leading-tight">{getWeightShiftLabel(weightShiftPercent)}</div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-xl p-3 sm:p-4 flex flex-col items-center text-center">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Progress</div>
                            <div className="text-2xl font-black text-blue-600 tabular-nums leading-tight">
                                {completedTargets}<span className="text-sm text-gray-400">/{totalTargets}</span>
                            </div>
                            <div className="text-xs text-gray-400 font-medium mt-1">{progressPercent}%</div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="bg-white rounded-2xl shadow-xl p-4">
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500 ease-out"
                                style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1.5 font-bold">
                            <span>0</span>
                            <span>{midpointTarget}</span>
                            <span>{totalTargets}</span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={primaryAction.onClick}
                            className={`py-5 rounded-2xl shadow-xl font-bold text-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] ${
                                primaryAction.tone === 'amber'
                                    ? 'bg-amber-400 hover:bg-amber-500 text-white'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                        >
                            <PrimaryActionIcon className="w-6 h-6" />
                            <span>{primaryAction.label}</span>
                        </button>

                        <button
                            onClick={secondaryAction.onClick}
                            className={`py-5 rounded-2xl shadow-xl font-bold text-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] ${
                                secondaryAction.tone === 'red'
                                    ? 'bg-red-500 hover:bg-red-600 text-white'
                                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                            }`}
                        >
                            <SecondaryActionIcon className="w-6 h-6" />
                            <span>{secondaryAction.label}</span>
                        </button>
                    </div>

                    {/* Footer info */}
                    <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                        <span>{safeModeEnabled ? 'Easy mode active' : `Target reach ${formatMetricNumber(displayStepCm, 0, '0')} / ${targetStepCm} cm`}</span>
                        {visibleSensors.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {visibleSensors.map((sensor) => (
                                    <span key={sensor.key} className="bg-blue-100 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{sensor.label}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>
            </main>
        </div>
    );
};

export default GameSteppingStones;