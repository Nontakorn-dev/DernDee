import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGaitProcessorClient } from '@shared/gait/gaitProcessorClient.js';
import { RealtimeStepDetector } from '@shared/gait/realtimeStepDetector.js';
import { GaitSessionAnalyzer } from '@shared/gait/sessionAnalyzer.js';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { createRealtimeConnection } from '@shared/gateway/realtimeTransport.js';
import {
    getRealtimeSensorLabel,
    getRealtimeSensorSideOrder,
    normalizeRealtimeSensorSample,
} from '@shared/gateway/realtimeSensorUtils.js';
import { usePersistedGatewaySession } from '@shared/hooks/usePersistedGatewaySession.js';
import {
    Activity,
    ArrowLeft,
    Footprints,
    Pause,
    Play,
    Settings,
    Shield,
    Square,
    Volume2,
    VolumeX,
    Waves,
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

const ANALYSIS_INTERVAL_MS = 400;
const MIN_ANALYSIS_SAMPLES = 300;
const MAX_VISIBLE_SENSORS = 2;
const SENSOR_STALE_AFTER_MS = 2500;
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

const STONE_SLOT_LAYOUT = [
    { left: '14%', bottom: '12%', scale: 1.0 },
    { left: '28%', bottom: '28%', scale: 0.96 },
    { left: '44%', bottom: '44%', scale: 0.93 },
    { left: '61%', bottom: '60%', scale: 0.9 },
    { left: '76%', bottom: '76%', scale: 0.87 },
];

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

function averageMetric(values) {
    const numericValues = values.filter(Number.isFinite);
    if (!numericValues.length) {
        return null;
    }

    return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
}

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
            return 'bg-emerald-500 text-white shadow-[0_12px_30px_rgba(16,185,129,0.25)]';
        case 'amber':
            return 'bg-amber-400 text-slate-900 shadow-[0_12px_28px_rgba(245,158,11,0.22)]';
        case 'red':
            return 'bg-rose-500 text-white shadow-[0_12px_30px_rgba(225,29,72,0.22)]';
        default:
            return 'bg-white text-slate-800 shadow-[0_12px_30px_rgba(47,111,222,0.12)]';
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
    const sensorRuntimesRef = useRef(new Map());
    const activeSensorKeysRef = useRef([]);
    const analysisTimerRef = useRef(null);
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
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();

        return () => {
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    const getVisibleSensorStates = useCallback(() => {
        return activeSensorKeysRef.current
            .map((sensorKey) => sensorRuntimesRef.current.get(sensorKey))
            .filter(Boolean)
            .sort(sortSensorStates);
    }, []);

    const syncAggregatedSessionMetrics = useCallback(() => {
        const visibleSensorStates = getVisibleSensorStates();
        const summaries = visibleSensorStates
            .map((sensorState) => sensorState.latestSummary)
            .filter(Boolean);

        setVisibleSensors(visibleSensorStates.map((sensorState) => ({
            key: sensorState.sensorKey,
            label: sensorState.label,
            side: sensorState.side,
        })));

        if (!summaries.length) {
            setSessionMetrics({});
            return;
        }

        setSessionMetrics({
            total_steps: summaries.reduce((total, summary) => total + (summary.totalSteps || 0), 0),
            cadence_spm: averageMetric(summaries.map((summary) => summary.cadenceSpm)) || 0,
            avg_step_length_m: averageMetric(summaries.map((summary) => summary.avgStepLengthM)),
            avg_stride_length_m: averageMetric(summaries.map((summary) => summary.avgStrideLengthM)),
            avg_clearance_m: averageMetric(summaries.map((summary) => summary.avgClearanceM)),
            avg_speed_mps: averageMetric(summaries.map((summary) => summary.avgSpeedMps)),
            avg_step_duration_s: averageMetric(summaries.map((summary) => summary.avgStepDurationS)),
        });
    }, [getVisibleSensorStates]);

    const syncVisibleSensorViews = useCallback(() => {
        activeSensorKeysRef.current = resolveVisibleSensorKeys(sensorRuntimesRef.current);
        const visibleSensorStates = getVisibleSensorStates();
        setVisibleSensors(visibleSensorStates.map((sensorState) => ({
            key: sensorState.sensorKey,
            label: sensorState.label,
            side: sensorState.side,
        })));
        return visibleSensorStates;
    }, [getVisibleSensorStates]);

    const destroySensorRuntime = useCallback((sensorState) => {
        sensorState.unsubscribeParams?.();
        sensorState.processor?.destroy?.();
    }, []);

    const collectGaitMetricsRows = useCallback(() => {
        return Array.from(sensorRuntimesRef.current.values())
            .flatMap((sensorState) => sensorState.sessionAnalyzer?.getGaitMetricsRows?.() || []);
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

    const advanceLandingState = useCallback((sensorState, detectorResult) => {
        const landingState = activeLandingRef.current;
        if (!landingState || landingState.sensorKey !== sensorState.sensorKey || gameStateRef.current !== GAME_STATES.PLAYING) {
            return;
        }

        const now = performance.now();
        const isStableStance = detectorResult?.phase === 'STANCE'
            && (detectorResult?.debug?.gyroNorm ?? Infinity) <= LANDING_STABLE_GYRO_NORM
            && Math.abs(detectorResult?.debug?.tiltRate ?? 0) <= LANDING_STABLE_TILT_RATE;

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

    const handleStepMetrics = useCallback((sensorState, params) => {
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
                sensorKey: sensorState.sensorKey,
                side: sensorState.side,
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

    const createSensorRuntime = useCallback((sample) => {
        const processor = createGaitProcessorClient();
        const stepDetector = new RealtimeStepDetector({ sensorMount: sample.sensorMount || 'shank' });
        const sessionAnalyzer = new GaitSessionAnalyzer();
        const sensorState = {
            sensorKey: sample.sensorKey,
            label: getRealtimeSensorLabel(sample),
            side: sample.side || null,
            sensorMount: sample.sensorMount || 'unknown',
            lastSeenAt: Date.now(),
            processor,
            stepDetector,
            sessionAnalyzer,
            sampleCount: 0,
            latestSummary: null,
            unsubscribeParams: null,
        };

        sensorState.unsubscribeParams = processor.onParams(({ params }) => {
            if (!params || gameStateRef.current !== GAME_STATES.PLAYING) {
                return;
            }

            sensorState.sessionAnalyzer.record(params);
            sensorState.latestSummary = sensorState.sessionAnalyzer.getSummary();
            syncAggregatedSessionMetrics();
            handleStepMetrics(sensorState, params);
        });

        sensorRuntimesRef.current.set(sample.sensorKey, sensorState);
        return sensorState;
    }, [handleStepMetrics, syncAggregatedSessionMetrics]);

    const resetDerivedAnalysis = useCallback(() => {
        sensorRuntimesRef.current.forEach((sensorState) => {
            destroySensorRuntime(sensorState);
        });
        sensorRuntimesRef.current.clear();
        activeSensorKeysRef.current = [];
        setVisibleSensors([]);
        setSessionMetrics({});
        clearLandingState();
    }, [clearLandingState, destroySensorRuntime]);

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

        let sensorState = sensorRuntimesRef.current.get(sample.sensorKey);
        if (!sensorState) {
            sensorState = createSensorRuntime(sample);
        }

        sensorState.label = getRealtimeSensorLabel(sample);
        sensorState.side = sample.side || null;
        sensorState.sensorMount = sample.sensorMount || 'unknown';
        sensorState.lastSeenAt = Date.now();
        sensorState.stepDetector?.setSensorMount?.(sensorState.sensorMount);

        syncVisibleSensorViews();
        if (!activeSensorKeysRef.current.includes(sample.sensorKey)) {
            return;
        }

        const detectorResult = sensorState.stepDetector?.update({
            gx: sample.gx,
            gy: sample.gy,
            gz: sample.gz,
            timestampMs: sample.timestamp_ms,
        });

        if (gameStateRef.current !== GAME_STATES.PLAYING) {
            return;
        }

        sensorState.processor.addSample({
            ax: sample.ax,
            ay: sample.ay,
            az: sample.az,
            gx: sample.gx,
            gy: sample.gy,
            gz: sample.gz,
            timestampMs: sample.timestamp_ms,
            side: sample.side,
            sensorName: sample.name,
            sensorMount: sample.sensorMount,
        });
        sensorState.sampleCount += 1;
        advanceLandingState(sensorState, detectorResult);
    }, [advanceLandingState, createSensorRuntime, syncVisibleSensorViews]);

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
        analysisTimerRef.current = setInterval(() => {
            sensorRuntimesRef.current.forEach((sensorState) => {
                if (sensorState.sampleCount >= MIN_ANALYSIS_SAMPLES) {
                    sensorState.processor?.analyze?.();
                }
            });
        }, ANALYSIS_INTERVAL_MS);

        return () => {
            if (analysisTimerRef.current) {
                clearInterval(analysisTimerRef.current);
                analysisTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        return () => {
            sensorRuntimesRef.current.forEach((sensorState) => {
                destroySensorRuntime(sensorState);
            });
            sensorRuntimesRef.current.clear();

            if (feedbackResetTimerRef.current) {
                clearTimeout(feedbackResetTimerRef.current);
            }
            if (jumpTimerRef.current) {
                clearTimeout(jumpTimerRef.current);
            }
        };
    }, [destroySensorRuntime]);

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
    const maxVisibleStart = Math.max(1, (totalTargets + 1) - STONE_SLOT_LAYOUT.length + 1);
    const visibleStartStoneNumber = Math.min(currentStoneNumber, maxVisibleStart);
    const visibleStoneNumbers = STONE_SLOT_LAYOUT
        .map((_, index) => visibleStartStoneNumber + index)
        .filter((stoneNumber) => stoneNumber <= totalTargets + 1);
    const progressPercent = totalTargets > 0 ? Math.round((completedTargets / totalTargets) * 100) : 0;
    const displayStrideCm = Number.isFinite(currentStrideCm)
        ? currentStrideCm
        : (Number.isFinite(sessionMetrics?.avg_stride_length_m) ? sessionMetrics.avg_stride_length_m * 100 : null);
    const displayStepCm = Number.isFinite(currentStepCm)
        ? currentStepCm
        : (Number.isFinite(sessionMetrics?.avg_step_length_m) ? sessionMetrics.avg_step_length_m * 100 : null);
    const safeModeEnabled = targetStepCm <= SAFE_TARGET_THRESHOLD_CM;

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,_#dbeafe_0%,_#eaf4ff_48%,_#cfe8ff_100%)] text-slate-900">
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={goBackToTherapy}
                        className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <img src={derndeeLogo} alt="DernDee" className="h-10 sm:h-12 object-contain" />
                </div>

                <div className="hidden md:flex items-center gap-3 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 shadow-inner">
                    <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                    <span>{isConnected ? 'Sensors connected' : 'Waiting for sensors'}</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSoundEnabled((previousValue) => !previousValue)}
                        className={`p-2 rounded-full transition-colors ${soundEnabled ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'}`}
                    >
                        {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={() => setShowSettings((previousValue) => !previousValue)}
                        className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-colors"
                    >
                        <Settings className="w-5 h-5 text-blue-700" />
                    </button>
                </div>
            </header>

            {showSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
                    <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
                        <div className="mb-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800">Stepping Stones</h2>
                                <p className="text-sm font-medium text-slate-500">Easy targets first, then build reach.</p>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="rounded-full p-2 hover:bg-slate-100">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-700">
                                    Target step reach: <span className="text-xl font-black text-emerald-600">{targetStepCm} cm</span>
                                </label>
                                <input
                                    type="range"
                                    min={MIN_TARGET_STEP_CM}
                                    max={MAX_TARGET_STEP_CM}
                                    step="1"
                                    value={targetStepCm}
                                    onChange={(event) => setTargetStepCm(Number(event.target.value))}
                                    className="w-full accent-emerald-500"
                                />
                                <div className="mt-1 flex justify-between text-xs font-medium text-slate-400">
                                    <span>Easy {MIN_TARGET_STEP_CM} cm</span>
                                    <span>Challenge {MAX_TARGET_STEP_CM} cm</span>
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-700">
                                    Stone targets: <span className="text-xl font-black text-blue-700">{totalTargets}</span>
                                </label>
                                <input
                                    type="range"
                                    min="6"
                                    max="14"
                                    step="1"
                                    value={totalTargets}
                                    onChange={(event) => setTotalTargets(Number(event.target.value))}
                                    className="w-full accent-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: 'Easy', step: 28, targets: 8 },
                                    { label: 'Standard', step: 35, targets: 10 },
                                    { label: 'Challenge', step: 44, targets: 12 },
                                ].map((preset) => (
                                    <button
                                        key={preset.label}
                                        onClick={() => {
                                            setTargetStepCm(preset.step);
                                            setTotalTargets(preset.targets);
                                        }}
                                        className="rounded-2xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>

                            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                                Use in a clear space and with support nearby if single-leg stance feels unsafe.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <main className="mx-auto grid min-h-[calc(100vh-88px)] max-w-6xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-10">
                <section className="lg:col-span-8">
                    <div className="mb-5 flex flex-col items-center gap-3 text-center">
                        <div className="rounded-full bg-white/85 px-6 py-2 text-sm font-bold uppercase tracking-[0.35em] text-slate-400 shadow-md">
                            Stepping Stones
                        </div>
                        <div className="text-5xl font-black tracking-tight text-slate-900 sm:text-6xl">
                            {formatTime(sessionTime)}
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {visibleSensors.length > 0 ? visibleSensors.map((sensor) => (
                                <span key={sensor.key} className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                                    {sensor.label}
                                </span>
                            )) : (
                                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                                    Waiting for shank sensors
                                </span>
                            )}
                            {safeModeEnabled && (
                                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm">
                                    Easy target mode
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="stepping-stones-river rounded-[2.25rem] p-5 shadow-[0_30px_80px_rgba(47,111,222,0.18)] sm:p-7">
                        <div className="relative h-[420px] rounded-[2rem] border border-white/40 bg-[linear-gradient(180deg,_rgba(255,255,255,0.16),_rgba(255,255,255,0.05))] p-4 shadow-inner sm:h-[500px]">
                            <div className="pointer-events-none absolute left-5 top-5 rounded-full bg-white/55 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-slate-500 shadow-sm">
                                River route
                            </div>

                            {visibleStoneNumbers.map((stoneNumber, index) => {
                                const slot = STONE_SLOT_LAYOUT[index];
                                const isCurrentStone = stoneNumber === currentStoneNumber;
                                const isTargetStone = targetStoneNumber !== null && stoneNumber === targetStoneNumber;
                                const isLandingStone = landingStoneNumber === stoneNumber;
                                const isPastStone = stoneNumber < currentStoneNumber;

                                return (
                                    <div
                                        key={stoneNumber}
                                        className="absolute"
                                        style={{
                                            left: slot.left,
                                            bottom: slot.bottom,
                                            transform: `scale(${slot.scale})`,
                                        }}
                                    >
                                        <div className={`stepping-stones-stone relative flex items-center justify-center ${isPastStone ? 'stepping-stones-stone--passed' : ''} ${isCurrentStone ? 'stepping-stones-stone--current' : ''} ${isTargetStone ? 'stepping-stones-stone--target' : ''}`}>
                                            {(isLandingStone || (isCurrentStone && isJumping)) && <div className="stepping-stones-ripple"></div>}
                                            <span className="absolute -top-8 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                                                Stone {stoneNumber}
                                            </span>

                                            {isCurrentStone && (
                                                <div className={`stepping-stones-avatar relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg ${isJumping ? 'stepping-stones-avatar--jumping' : ''}`}>
                                                    <Footprints className="h-5 w-5" />
                                                </div>
                                            )}

                                            {isLandingStone && !isCurrentStone && (
                                                <div className="stepping-stones-avatar relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
                                                    <Footprints className="h-5 w-5" />
                                                </div>
                                            )}

                                            {isTargetStone && !isLandingStone && !isCurrentStone && (
                                                <div className="absolute inset-0 flex items-center justify-center text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
                                                    Target
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="absolute bottom-5 left-5 right-5 grid gap-3 sm:grid-cols-[1.1fr_auto] sm:items-end">
                                <div className="rounded-[1.5rem] bg-white/78 px-4 py-3 shadow-lg backdrop-blur-md">
                                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                                        <Waves className="h-4 w-4 text-blue-600" />
                                        Mission cue
                                    </div>
                                    <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700 sm:text-base">
                                        {gameState === GAME_STATES.READY && 'Start in a safe area, then step to the highlighted stone.'}
                                        {gameState === GAME_STATES.PLAYING && 'Reach the green stone, then hold steady to shift weight safely.'}
                                        {gameState === GAME_STATES.PAUSED && 'Mission paused. Resume when you are ready and stable.'}
                                        {gameState === GAME_STATES.COMPLETED && 'Mission complete. Review your step reach and start again when ready.'}
                                    </p>
                                </div>

                                <div className="rounded-[1.5rem] bg-slate-900/85 px-4 py-3 text-left text-white shadow-xl backdrop-blur-md">
                                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">Target step</div>
                                    <div className="mt-1 text-3xl font-black">{targetStepCm} cm</div>
                                    <div className="text-xs font-medium text-slate-300">Current stone {currentStoneNumber}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 flex justify-center">
                        <div key={feedback.key} className={`stepping-stones-feedback rounded-full px-6 py-3 text-base font-black tracking-wide ${getFeedbackToneClasses(feedback.tone)}`}>
                            {feedback.text}
                        </div>
                    </div>
                </section>

                <aside className="lg:col-span-4 flex flex-col gap-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        <div className="rounded-[1.8rem] bg-white p-5 shadow-xl">
                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                                <Activity className="h-4 w-4 text-emerald-600" />
                                Stride
                            </div>
                            <div className="mt-3 text-4xl font-black text-slate-900">
                                {formatMetricNumber(displayStrideCm, 0)}
                                <span className="ml-2 text-base font-bold text-slate-400">cm</span>
                            </div>
                            <p className="mt-3 text-sm font-medium text-slate-500">
                                Step reach {formatMetricNumber(displayStepCm, 0)} / {targetStepCm} cm
                            </p>
                        </div>

                        <div className="rounded-[1.8rem] bg-white p-5 shadow-xl">
                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                                <Shield className="h-4 w-4 text-blue-600" />
                                Weight shift
                            </div>
                            <div className="mt-3 text-4xl font-black text-slate-900">
                                {formatPercent(weightShiftPercent)}
                            </div>
                            <p className="mt-3 text-sm font-medium text-slate-500">
                                {getWeightShiftLabel(weightShiftPercent)}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-[1.8rem] bg-white p-5 shadow-xl">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Step progress</div>
                                <div className="mt-2 text-3xl font-black text-slate-900">{completedTargets} / {totalTargets}</div>
                            </div>
                            <div className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-700">
                                {progressPercent}%
                            </div>
                        </div>
                        <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
                            <div
                                className="h-full rounded-full bg-[linear-gradient(90deg,_#2ec7a0_0%,_#2f6fde_100%)] transition-all duration-500"
                                style={{ width: `${completedTargets > 0 ? Math.max(6, progressPercent) : 0}%` }}
                            ></div>
                        </div>
                        <p className="mt-3 text-sm font-medium text-slate-500">
                            Land on the target and hold steady before moving to the next stone.
                        </p>
                    </div>

                    <div className="rounded-[1.8rem] border border-white/70 bg-white/85 p-5 shadow-xl backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                            <Shield className="h-4 w-4 text-amber-500" />
                            Safety cue
                        </div>
                        <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">
                            Practice in a clear area. Use the easy target mode first and have a caregiver nearby if single-leg stance feels unstable.
                        </p>
                    </div>

                    <div className="mt-auto grid grid-cols-2 gap-4">
                        {gameState === GAME_STATES.PLAYING && (
                            <button
                                onClick={pauseSession}
                                className="flex items-center justify-center gap-2 rounded-[1.6rem] bg-amber-400 px-4 py-4 text-base font-black text-slate-900 shadow-xl transition-transform hover:scale-[1.01]"
                            >
                                <Pause className="h-5 w-5" />
                                Pause
                            </button>
                        )}

                        {gameState === GAME_STATES.PAUSED && (
                            <button
                                onClick={resumeSession}
                                className="flex items-center justify-center gap-2 rounded-[1.6rem] bg-emerald-500 px-4 py-4 text-base font-black text-white shadow-xl transition-transform hover:scale-[1.01]"
                            >
                                <Play className="h-5 w-5" />
                                Resume
                            </button>
                        )}

                        {(gameState === GAME_STATES.READY || gameState === GAME_STATES.COMPLETED) && (
                            <button
                                onClick={startSession}
                                className="col-span-2 flex items-center justify-center gap-2 rounded-[1.6rem] bg-emerald-500 px-4 py-4 text-base font-black text-white shadow-xl transition-transform hover:scale-[1.01]"
                            >
                                <Play className="h-5 w-5" />
                                {gameState === GAME_STATES.COMPLETED ? 'Play Again' : 'Start Mission'}
                            </button>
                        )}

                        {(gameState === GAME_STATES.PLAYING || gameState === GAME_STATES.PAUSED) && (
                            <button
                                onClick={stopSession}
                                className="flex items-center justify-center gap-2 rounded-[1.6rem] bg-rose-500 px-4 py-4 text-base font-black text-white shadow-xl transition-transform hover:scale-[1.01]"
                            >
                                <Square className="h-5 w-5" />
                                Stop
                            </button>
                        )}

                        {gameState === GAME_STATES.COMPLETED && (
                            <button
                                onClick={resetSession}
                                className="flex items-center justify-center gap-2 rounded-[1.6rem] bg-amber-400 px-4 py-4 text-base font-black text-slate-900 shadow-xl transition-transform hover:scale-[1.01]"
                            >
                                <Pause className="h-5 w-5" />
                                Reset
                            </button>
                        )}

                        {gameState === GAME_STATES.COMPLETED && (
                            <button
                                onClick={goBackToTherapy}
                                className="flex items-center justify-center gap-2 rounded-[1.6rem] bg-rose-500 px-4 py-4 text-base font-black text-white shadow-xl transition-transform hover:scale-[1.01]"
                            >
                                <Square className="h-5 w-5" />
                                Back
                            </button>
                        )}
                    </div>
                </aside>
            </main>
        </div>
    );
};

export default GameSteppingStones;