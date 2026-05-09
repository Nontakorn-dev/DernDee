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
    { left: '50%', bottom: '7%', scale: 1.08 },
    { left: '52%', bottom: '29%', scale: 0.96 },
    { left: '49%', bottom: '51%', scale: 0.86 },
    { left: '53%', bottom: '73%', scale: 0.76 },
    { left: '50%', bottom: '95%', scale: 0.66 },
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
            return 'stepping-stones-feedback-badge--emerald';
        case 'amber':
            return 'stepping-stones-feedback-badge--amber';
        case 'red':
            return 'stepping-stones-feedback-badge--red';
        default:
            return 'stepping-stones-feedback-badge--sky';
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
        <div className="stepping-stones-screen">
            <header className="stepping-stones-header">
                <div className="stepping-stones-header-brand">
                    <img src={derndeeLogo} alt="DernDee" className="stepping-stones-header-logo" />
                </div>

                <div className="stepping-stones-header-actions">
                    <button
                        onClick={() => setSoundEnabled((previousValue) => !previousValue)}
                        className="stepping-stones-icon-button"
                        aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}
                    >
                        {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                    </button>
                    <button
                        onClick={() => setShowSettings((previousValue) => !previousValue)}
                        className="stepping-stones-icon-button"
                        aria-label="Open settings"
                    >
                        <Settings className="h-5 w-5" />
                    </button>
                </div>
            </header>

            {showSettings && (
                <div className="stepping-stones-modal-backdrop">
                    <div className="stepping-stones-modal-card">
                        <div className="stepping-stones-modal-header">
                            <div>
                                <h2 className="stepping-stones-modal-title">Stepping Stones</h2>
                                <p className="stepping-stones-modal-subtitle">Match the rehab view on iPhone and iPad, then tune challenge here.</p>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="stepping-stones-modal-close">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="stepping-stones-modal-body">
                            <div className="stepping-stones-modal-status">
                                <span className={`stepping-stones-modal-status-dot ${isConnected ? 'stepping-stones-modal-status-dot--connected' : ''}`}></span>
                                <span>{isConnected ? 'Sensors connected' : 'Waiting for sensors'}</span>
                            </div>

                            <div>
                                <label className="stepping-stones-modal-label">
                                    Target step reach <span>{targetStepCm} cm</span>
                                </label>
                                <input
                                    type="range"
                                    min={MIN_TARGET_STEP_CM}
                                    max={MAX_TARGET_STEP_CM}
                                    step="1"
                                    value={targetStepCm}
                                    onChange={(event) => setTargetStepCm(Number(event.target.value))}
                                    className="stepping-stones-slider stepping-stones-slider--emerald"
                                />
                                <div className="stepping-stones-modal-scale">
                                    <span>Easy {MIN_TARGET_STEP_CM} cm</span>
                                    <span>Challenge {MAX_TARGET_STEP_CM} cm</span>
                                </div>
                            </div>

                            <div>
                                <label className="stepping-stones-modal-label">
                                    Stone targets <span>{totalTargets}</span>
                                </label>
                                <input
                                    type="range"
                                    min="6"
                                    max="14"
                                    step="1"
                                    value={totalTargets}
                                    onChange={(event) => setTotalTargets(Number(event.target.value))}
                                    className="stepping-stones-slider stepping-stones-slider--blue"
                                />
                            </div>

                            <div className="stepping-stones-modal-presets">
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
                                        className="stepping-stones-preset-button"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>

                            <div className="stepping-stones-modal-safety">
                                Use in a clear space and keep support nearby if single-leg stance still feels unsafe.
                            </div>

                            <div className="stepping-stones-modal-actions">
                                <button onClick={goBackToTherapy} className="stepping-stones-modal-secondary">
                                    Back to Therapy
                                </button>
                                <button onClick={() => setShowSettings(false)} className="stepping-stones-modal-primary">
                                    Continue
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <main className="stepping-stones-layout">
                <section className="stepping-stones-stage-shell">
                    <div className="stepping-stones-stage">
                        {!isConnected && (
                            <div className="stepping-stones-status-pill">
                                Waiting for sensors
                            </div>
                        )}

                        <div className="stepping-stones-timer-wrap">
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
                            const slot = STONE_SLOT_LAYOUT[index];
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

                <aside className="stepping-stones-panel">
                    <div className="stepping-stones-feedback-wrap">
                        <div key={feedback.key} className={`stepping-stones-feedback stepping-stones-feedback-badge ${getFeedbackToneClasses(feedback.tone)}`}>
                            {feedback.text}
                        </div>
                    </div>

                    <div className="stepping-stones-metrics-grid">
                        <article className="stepping-stones-metric-card">
                            <div className="stepping-stones-metric-label">Stride Length</div>
                            <div className="stepping-stones-metric-value">
                                {displayedStrideCm}
                                <span>cm</span>
                            </div>
                            <div className="stepping-stones-metric-subtext">Target {targetStepCm} cm</div>
                        </article>

                        <article className="stepping-stones-metric-card">
                            <div className="stepping-stones-metric-label">Weight Bearing</div>
                            <div className="stepping-stones-metric-value">{displayedWeightBearing}%</div>
                            <div className="stepping-stones-status-chip">{getWeightShiftLabel(weightShiftPercent)}</div>
                        </article>

                        <article className="stepping-stones-metric-card">
                            <div className="stepping-stones-metric-label">Step Progress</div>
                            <div className="stepping-stones-metric-value stepping-stones-metric-value--progress">
                                {completedTargets}
                                <span>/{totalTargets}</span>
                            </div>
                            <div className="stepping-stones-metric-subtext">{progressPercent}% Complete</div>
                        </article>
                    </div>

                    <div className="stepping-stones-progress-card">
                        <div className="stepping-stones-progress-track">
                            <div
                                className="stepping-stones-progress-fill"
                                style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                            ></div>
                        </div>
                        <div className="stepping-stones-progress-scale">
                            <span>0</span>
                            <span>{midpointTarget}</span>
                            <span>{totalTargets}</span>
                        </div>
                    </div>

                    <div className="stepping-stones-actions-grid">
                        <button
                            onClick={primaryAction.onClick}
                            className={`stepping-stones-action-button stepping-stones-action-button--${primaryAction.tone}`}
                        >
                            <PrimaryActionIcon className="h-6 w-6" />
                            <span>{primaryAction.label}</span>
                        </button>

                        <button
                            onClick={secondaryAction.onClick}
                            className={`stepping-stones-action-button stepping-stones-action-button--${secondaryAction.tone}`}
                        >
                            <SecondaryActionIcon className="h-6 w-6" />
                            <span>{secondaryAction.label}</span>
                        </button>
                    </div>

                    <div className="stepping-stones-panel-footer">
                        <span>{safeModeEnabled ? 'Easy mode active' : `Target reach ${formatMetricNumber(displayStepCm, 0, '0')} / ${targetStepCm} cm`}</span>
                        {visibleSensors.length > 0 && (
                            <div className="stepping-stones-sensor-pills">
                                {visibleSensors.map((sensor) => (
                                    <span key={sensor.key} className="stepping-stones-sensor-pill">{sensor.label}</span>
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