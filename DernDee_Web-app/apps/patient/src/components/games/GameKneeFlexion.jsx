import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { KneeAngleEstimator } from '@shared/gait/kneeAngleEstimator.js';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { createRealtimeConnection } from '@shared/gateway/realtimeTransport.js';
import {
    getRealtimeSensorLabel,
    normalizeRealtimeSensorSample,
} from '@shared/gateway/realtimeSensorUtils.js';
import { usePersistedGatewaySession } from '@shared/hooks/usePersistedGatewaySession.js';
import { resolveActiveLegPairs } from '@shared/gait/gaitSensorSelection.js';
import { getGameAudioContext, unlockGameAudio } from '@shared/audio/unlockGameAudio.js';
import { playGameHtmlSfx, shouldUseHtmlGameSfx } from '@shared/audio/playGameHtmlSfx.js';
import {
    ArrowLeft,
    ArrowRight,
    Settings,
    Pause,
    Play,
    Square,
    X,
    Volume2,
    VolumeX,
    Vibrate,
    Armchair,
    Hand,
    Footprints,
} from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const GAUGE_MAX_SCALE = 100;
const REP_REARM_HOLD_MS = 140;
const MIN_REP_INTERVAL_MS = 1800;
const VISUAL_FLOOR_SNAP_THRESHOLD_DEG = 5;
const VISUAL_FLOOR_HOLD_MS = 180;
const VISUAL_POST_HIT_HOLD_MS = 500;
const SENSOR_STALE_AFTER_MS = 2500;

const GAME_STATES = {
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
};

const TRAINING_MODES = {
    SEATED: {
        id: 'seated',
        label: 'นั่ง',
        displayLabel: 'Seated',
        description: 'งอเข่าขณะนั่ง',
        icon: Armchair,
        targetFlexionDeg: 70,
        totalReps: 15,
        resetThresholdDeg: 25,
    },
    STANDING_RAIL: {
        id: 'standing_rail',
        label: 'ยืนจับราว',
        displayLabel: 'Standing Rail',
        description: 'ยืนจับราวยกขา',
        icon: Hand,
        targetFlexionDeg: 55,
        totalReps: 12,
        resetThresholdDeg: 20,
    },
    WALKING: {
        id: 'walking',
        label: 'เดิน',
        displayLabel: 'Walking',
        description: 'ยกขาแบบก้าวเดิน',
        icon: Footprints,
        targetFlexionDeg: 45,
        totalReps: 20,
        resetThresholdDeg: 15,
    },
};

function createSensorRuntime(sample) {
    return {
        sensorKey: sample.sensorKey,
        label: getRealtimeSensorLabel(sample),
        side: sample.side || null,
        sensorMount: sample.sensorMount || 'unknown',
        lastSeenAt: Date.now(),
    };
}

const GameKneeFlexion = () => {
    const navigate = useNavigate();
    const { user } = useUserAuth();

    const [gameState, setGameState] = useState(GAME_STATES.READY);
    const [trainingModeId, setTrainingModeId] = useState(TRAINING_MODES.SEATED.id);
    const [targetFlexionDeg, setTargetFlexionDeg] = useState(TRAINING_MODES.SEATED.targetFlexionDeg);
    const [resetThresholdDeg, setResetThresholdDeg] = useState(TRAINING_MODES.SEATED.resetThresholdDeg);
    const [totalReps, setTotalReps] = useState(TRAINING_MODES.SEATED.totalReps);
    const [showSettings, setShowSettings] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [vibrationEnabled, setVibrationEnabled] = useState(true);

    const [currentFlexionDeg, setCurrentFlexionDeg] = useState(0);
    const [displayFlexionDeg, setDisplayFlexionDeg] = useState(0);
    const [averageFlexionDeg, setAverageFlexionDeg] = useState(0);
    const [reps, setReps] = useState(0);
    const [sessionTime, setSessionTime] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [hasLegPair, setHasLegPair] = useState(false);
    const [activeLegLabel, setActiveLegLabel] = useState('—');
    const [repState, setRepState] = useState('READY');

    const wsRef = useRef(null);
    const timerRef = useRef(null);
    const manualDisconnectRef = useRef(false);
    const sensorRuntimesRef = useRef(new Map());
    const legEstimatorsRef = useRef(new Map());
    const activeLegSideRef = useRef(null);
    const audioContextRef = useRef(null);
    const handleSensorDataRef = useRef(null);

    const repResetCandidateStartedAtRef = useRef(null);
    const repResetEligibleRef = useRef(false);
    const lastRepCountAtRef = useRef(0);
    const visualPeakLockRef = useRef(false);
    const visualFloorCandidateStartedAtRef = useRef(null);
    const visualFloorSnapEligibleRef = useRef(false);
    const activeRepPeakFlexionRef = useRef(0);
    const pendingAverageCommitRef = useRef(false);
    const averageFlexionTotalRef = useRef(0);
    const averageFlexionCountRef = useRef(0);

    const trainingMode = Object.values(TRAINING_MODES).find((mode) => mode.id === trainingModeId) || TRAINING_MODES.SEATED;

    const [isWideScreen, setIsWideScreen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 1024px)');
        const handler = (event) => setIsWideScreen(event.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const displayMaxScale = GAUGE_MAX_SCALE;
    const displayFlexionPercent = Math.min(100, (displayFlexionDeg / displayMaxScale) * 100);
    const targetLinePercent = Math.min(100, (targetFlexionDeg / displayMaxScale) * 100);

    const getGaugeState = () => {
        if (displayFlexionDeg >= targetFlexionDeg) return 'SUCCESS';
        if (displayFlexionDeg >= targetFlexionDeg * 0.5) return 'APPROACHING';
        return 'IDLE';
    };

    const gaugeState = getGaugeState();
    const averageFlexionToneClass = averageFlexionDeg >= targetFlexionDeg
        ? 'text-emerald-500'
        : averageFlexionDeg >= targetFlexionDeg * 0.7
            ? 'text-amber-500'
            : 'text-blue-500';

    const canChangeMode = gameState !== GAME_STATES.PLAYING;

    const applyTrainingMode = useCallback((modeId) => {
        if (gameState === GAME_STATES.PLAYING) {
            return;
        }

        const mode = Object.values(TRAINING_MODES).find((item) => item.id === modeId);
        if (!mode) {
            return;
        }

        setTrainingModeId(mode.id);
        setTargetFlexionDeg(mode.targetFlexionDeg);
        setResetThresholdDeg(mode.resetThresholdDeg);
        setTotalReps(mode.totalReps);
    }, [gameState]);

    const resetAverageTracking = useCallback(() => {
        activeRepPeakFlexionRef.current = 0;
        pendingAverageCommitRef.current = false;
        averageFlexionTotalRef.current = 0;
        averageFlexionCountRef.current = 0;
        setAverageFlexionDeg(0);
    }, []);

    const commitAveragePeak = useCallback(() => {
        if (!pendingAverageCommitRef.current) {
            return;
        }

        const peakFlexionDeg = activeRepPeakFlexionRef.current;
        if (peakFlexionDeg > 0) {
            averageFlexionTotalRef.current += peakFlexionDeg;
            averageFlexionCountRef.current += 1;
            setAverageFlexionDeg(averageFlexionTotalRef.current / averageFlexionCountRef.current);
        }

        activeRepPeakFlexionRef.current = 0;
        pendingAverageCommitRef.current = false;
    }, []);

    const resetSensorTracking = useCallback(() => {
        sensorRuntimesRef.current.clear();
        legEstimatorsRef.current.clear();
        activeLegSideRef.current = null;
        setHasLegPair(false);
        setActiveLegLabel('—');
        visualFloorCandidateStartedAtRef.current = null;
        visualFloorSnapEligibleRef.current = false;
        resetAverageTracking();
        setCurrentFlexionDeg(0);
        setDisplayFlexionDeg(0);
    }, [resetAverageTracking]);

    const syncActiveLegPair = useCallback(() => {
        const pairs = resolveActiveLegPairs(
            Array.from(sensorRuntimesRef.current.values()),
            { staleAfterMs: SENSOR_STALE_AFTER_MS },
        );

        setHasLegPair(pairs.length > 0);
        if (pairs.length === 0) {
            activeLegSideRef.current = null;
            setActiveLegLabel('—');
            return null;
        }

        const preferredPair = pairs.find((pair) => pair.side === activeLegSideRef.current) || pairs[0];
        activeLegSideRef.current = preferredPair.side;
        setActiveLegLabel(preferredPair.side === 'L' ? 'Left leg' : 'Right leg');
        return preferredPair;
    }, []);

    const getLegEstimator = useCallback((side) => {
        if (!legEstimatorsRef.current.has(side)) {
            legEstimatorsRef.current.set(side, new KneeAngleEstimator());
        }
        return legEstimatorsRef.current.get(side);
    }, []);

    const playSuccessSound = useCallback(() => {
        if (!soundEnabled) return;
        if (shouldUseHtmlGameSfx()) {
            playGameHtmlSfx('success');
            return;
        }
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') ctx.resume();

            const fundamental = ctx.createOscillator();
            const harmonic = ctx.createOscillator();
            const gain = ctx.createGain();
            fundamental.connect(gain);
            harmonic.connect(gain);
            gain.connect(ctx.destination);
            fundamental.frequency.value = 659.25;
            fundamental.type = 'triangle';
            harmonic.frequency.value = 987.77;
            harmonic.type = 'sine';
            gain.gain.setValueAtTime(0.001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
            fundamental.start(ctx.currentTime);
            harmonic.start(ctx.currentTime);
            fundamental.stop(ctx.currentTime + 0.22);
            harmonic.stop(ctx.currentTime + 0.22);
        } catch {
            // ignore
        }
    }, [soundEnabled]);

    const playMissionCompleteSound = useCallback(() => {
        if (!soundEnabled) return;
        if (shouldUseHtmlGameSfx()) {
            playGameHtmlSfx('complete');
            return;
        }
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') ctx.resume();

            const notes = [
                { freq: 523.25, t: 0 },
                { freq: 659.25, t: 0.12 },
                { freq: 783.99, t: 0.24 },
                { freq: 1046.5, t: 0.38 },
            ];

            notes.forEach(({ freq, t }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = 'triangle';
                gain.gain.setValueAtTime(0.001, ctx.currentTime + t);
                gain.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + t + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + 0.25);
                osc.start(ctx.currentTime + t);
                osc.stop(ctx.currentTime + t + 0.3);
            });
        } catch {
            // ignore
        }
    }, [soundEnabled]);

    useEffect(() => {
        const unlock = () => {
            audioContextRef.current = unlockGameAudio(getGameAudioContext(audioContextRef.current));
        };

        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('touchend', unlock, true);
        document.addEventListener('visibilitychange', unlock);
        return () => {
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('touchend', unlock, true);
            document.removeEventListener('visibilitychange', unlock);
        };
    }, []);

    const buildSessionSummary = useCallback(() => ({
        total_steps: reps,
        avg_clearance_m: null,
        symmetry_score: averageFlexionDeg > 0
            ? Math.round(Math.min(100, (averageFlexionDeg / targetFlexionDeg) * 100))
            : null,
    }), [averageFlexionDeg, reps, targetFlexionDeg]);

    const buildSessionDetails = useCallback(() => ({
        game_label: 'Knee Flexion Quest',
        training_mode: trainingModeId,
        target_flexion_deg: targetFlexionDeg,
        average_flexion_deg: averageFlexionDeg,
        completed_reps: reps,
        goal_reps: totalReps,
        active_leg: activeLegSideRef.current,
    }), [averageFlexionDeg, reps, targetFlexionDeg, totalReps, trainingModeId]);

    const { endSessionIfActive } = usePersistedGatewaySession({
        wsRef,
        userId: user?.uid,
        isConnected,
        shouldStart: gameState === GAME_STATES.PLAYING,
        shouldComplete: gameState === GAME_STATES.COMPLETED,
        sessionType: 'knee_flexion_quest',
        buildSummary: buildSessionSummary,
        buildDetails: buildSessionDetails,
        metadata: {
            game_label: 'Knee Flexion Quest',
            training_mode: trainingModeId,
        },
    });

    const handleSensorData = useCallback((msg) => {
        if (msg.type !== 'DATA') return;

        const sample = normalizeRealtimeSensorSample(msg.payload || {});
        const now = Date.now();
        if (!sample) return;

        let sensorState = sensorRuntimesRef.current.get(sample.sensorKey);
        if (!sensorState) {
            sensorState = createSensorRuntime(sample);
            sensorRuntimesRef.current.set(sample.sensorKey, sensorState);
        }

        sensorState.label = getRealtimeSensorLabel(sample);
        sensorState.side = sample.side || null;
        sensorState.sensorMount = sample.sensorMount || 'unknown';
        sensorState.lastSeenAt = now;

        const activePair = syncActiveLegPair();
        if (!activePair || !sample.side || sample.side !== activePair.side) {
            return;
        }

        const estimator = getLegEstimator(sample.side);
        const trackerSample = {
            ...sample,
            timestampMs: sample.timestampMs ?? sample.timestamp_ms ?? now,
        };

        let flexionDeg = null;
        if (sample.sensorMount === 'thigh') {
            flexionDeg = estimator.updateThigh(trackerSample);
        } else if (sample.sensorMount === 'shank') {
            flexionDeg = estimator.updateShank(trackerSample);
        }

        if (!Number.isFinite(flexionDeg)) {
            return;
        }

        const clampedFlexion = Math.min(GAUGE_MAX_SCALE, Math.max(0, flexionDeg));
        setCurrentFlexionDeg(clampedFlexion);

        const extensionCandidate = clampedFlexion <= resetThresholdDeg;
        if (extensionCandidate) {
            if (!repResetCandidateStartedAtRef.current) {
                repResetCandidateStartedAtRef.current = now;
            }
            repResetEligibleRef.current = (now - repResetCandidateStartedAtRef.current) >= REP_REARM_HOLD_MS;
        } else {
            repResetCandidateStartedAtRef.current = null;
            repResetEligibleRef.current = false;
        }

        const floorCandidate = clampedFlexion <= VISUAL_FLOOR_SNAP_THRESHOLD_DEG;
        if (floorCandidate) {
            if (!visualFloorCandidateStartedAtRef.current) {
                visualFloorCandidateStartedAtRef.current = now;
            }
            visualFloorSnapEligibleRef.current = (now - visualFloorCandidateStartedAtRef.current) >= VISUAL_FLOOR_HOLD_MS;
        } else {
            visualFloorCandidateStartedAtRef.current = null;
            visualFloorSnapEligibleRef.current = false;
        }
    }, [getLegEstimator, resetThresholdDeg, syncActiveLegPair]);

    useEffect(() => {
        handleSensorDataRef.current = handleSensorData;
    }, [handleSensorData]);

    useEffect(() => {
        manualDisconnectRef.current = false;

        const connectWebSocket = () => {
            try {
                wsRef.current = createRealtimeConnection();
                wsRef.current.onopen = () => setIsConnected(true);
                wsRef.current.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        handleSensorDataRef.current?.(msg);
                    } catch (error) {
                        console.error('Parse error:', error);
                    }
                };
                wsRef.current.onclose = () => {
                    setIsConnected(false);
                    resetSensorTracking();
                    if (!manualDisconnectRef.current) {
                        setTimeout(connectWebSocket, 3000);
                    }
                };
            } catch (error) {
                console.error('WebSocket connection error:', error);
            }
        };

        connectWebSocket();
        return () => {
            manualDisconnectRef.current = true;
            endSessionIfActive();
            wsRef.current?.close();
        };
    }, [endSessionIfActive, resetSensorTracking]);

    useEffect(() => {
        if (gameState !== GAME_STATES.PLAYING) return;
        if (currentFlexionDeg > activeRepPeakFlexionRef.current) {
            activeRepPeakFlexionRef.current = currentFlexionDeg;
        }
    }, [currentFlexionDeg, gameState]);

    useEffect(() => {
        if (gameState !== GAME_STATES.PLAYING) return;

        const now = Date.now();
        const repCooldownElapsed = !lastRepCountAtRef.current
            || (now - lastRepCountAtRef.current) >= MIN_REP_INTERVAL_MS;

        if (repState === 'READY' && currentFlexionDeg >= targetFlexionDeg && repCooldownElapsed) {
            activeRepPeakFlexionRef.current = Math.max(activeRepPeakFlexionRef.current, currentFlexionDeg);
            pendingAverageCommitRef.current = true;
            setRepState('HIT_TARGET');
            lastRepCountAtRef.current = now;
            setReps((previous) => previous + 1);

            if (vibrationEnabled && navigator.vibrate) {
                navigator.vibrate(50);
            }
            playSuccessSound();
        } else if (
            repState === 'HIT_TARGET'
            && repResetEligibleRef.current
            && currentFlexionDeg <= resetThresholdDeg
            && repCooldownElapsed
        ) {
            commitAveragePeak();
            setRepState('READY');
        }
    }, [
        commitAveragePeak,
        currentFlexionDeg,
        gameState,
        playSuccessSound,
        repState,
        resetThresholdDeg,
        targetFlexionDeg,
        vibrationEnabled,
    ]);

    useEffect(() => {
        if (gameState !== GAME_STATES.PLAYING) return;
        if (reps >= totalReps && totalReps > 0) {
            commitAveragePeak();
            setGameState(GAME_STATES.COMPLETED);
            if (timerRef.current) clearInterval(timerRef.current);
            playMissionCompleteSound();
        }
    }, [reps, totalReps, gameState, commitAveragePeak, playMissionCompleteSound]);

    useEffect(() => {
        if (gameState === GAME_STATES.READY || gameState === GAME_STATES.COMPLETED) {
            visualPeakLockRef.current = false;
            setDisplayFlexionDeg(currentFlexionDeg);
            return;
        }

        const cooldownActive = !!lastRepCountAtRef.current
            && (Date.now() - lastRepCountAtRef.current) < MIN_REP_INTERVAL_MS;
        const cooldownElapsedMs = lastRepCountAtRef.current
            ? (Date.now() - lastRepCountAtRef.current)
            : Infinity;

        setDisplayFlexionDeg((previous) => {
            if (cooldownActive && cooldownElapsedMs >= VISUAL_POST_HIT_HOLD_MS) {
                visualPeakLockRef.current = false;
                return 0;
            }

            if (visualFloorSnapEligibleRef.current) {
                visualPeakLockRef.current = false;
                return 0;
            }

            if (currentFlexionDeg <= resetThresholdDeg && repResetEligibleRef.current && currentFlexionDeg <= previous) {
                visualPeakLockRef.current = false;
                return 0;
            }

            if (repState !== 'HIT_TARGET') {
                visualPeakLockRef.current = false;
                const followFactor = currentFlexionDeg >= previous ? 0.75 : 0.28;
                return previous + ((currentFlexionDeg - previous) * followFactor);
            }

            if (currentFlexionDeg < previous - 0.5) {
                visualPeakLockRef.current = true;
            }

            if (visualPeakLockRef.current && currentFlexionDeg > previous) {
                return previous;
            }

            const followFactor = currentFlexionDeg >= previous ? 0.45 : 0.18;
            return previous + ((currentFlexionDeg - previous) * followFactor);
        });
    }, [currentFlexionDeg, gameState, repState, resetThresholdDeg]);

    useEffect(() => {
        if (gameState === GAME_STATES.PLAYING) {
            timerRef.current = setInterval(() => setSessionTime((previous) => previous + 1), 1000);
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [gameState]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const startSession = () => {
        if (!hasLegPair) return;

        audioContextRef.current = unlockGameAudio(getGameAudioContext(audioContextRef.current));

        const activePair = syncActiveLegPair();
        if (activePair) {
            getLegEstimator(activePair.side).calibrateToCurrentPose();
        }

        setGameState(GAME_STATES.PLAYING);
        setCurrentFlexionDeg(0);
        setDisplayFlexionDeg(0);
        resetAverageTracking();
        setReps(0);
        setSessionTime(0);
        setRepState('READY');
        repResetCandidateStartedAtRef.current = null;
        repResetEligibleRef.current = false;
        lastRepCountAtRef.current = 0;
        visualPeakLockRef.current = false;
        visualFloorCandidateStartedAtRef.current = null;
        visualFloorSnapEligibleRef.current = false;
    };

    const pauseSession = () => setGameState(GAME_STATES.PAUSED);
    const resumeSession = () => {
        audioContextRef.current = unlockGameAudio(getGameAudioContext(audioContextRef.current));
        setGameState(GAME_STATES.PLAYING);
    };

    const stopSession = () => {
        commitAveragePeak();
        setGameState(GAME_STATES.COMPLETED);
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const resetSession = () => {
        setGameState(GAME_STATES.READY);
        setReps(0);
        setSessionTime(0);
        setCurrentFlexionDeg(0);
        setDisplayFlexionDeg(0);
        resetAverageTracking();
        setRepState('READY');
        repResetCandidateStartedAtRef.current = null;
        repResetEligibleRef.current = false;
        lastRepCountAtRef.current = 0;
        visualPeakLockRef.current = false;
        visualFloorCandidateStartedAtRef.current = null;
        visualFloorSnapEligibleRef.current = false;
    };

    const getGaugeColor = () => {
        switch (gaugeState) {
            case 'SUCCESS': return 'bg-emerald-500';
            case 'APPROACHING': return 'bg-amber-400';
            default: return 'bg-blue-400';
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
            <style>{`
                @keyframes fadeInScale {
                    from { opacity: 0; transform: scale(0.92); }
                    to   { opacity: 1; transform: scale(1); }
                }
            `}</style>

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
                <div className="text-center" />
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-colors"
                >
                    <Settings className="w-5 h-5 text-blue-600" />
                </button>
            </header>

            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-extrabold text-gray-800">Settings</h3>
                            <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-3">โหมดฝึก</label>
                            <div className="grid grid-cols-1 gap-2">
                                {Object.values(TRAINING_MODES).map((mode) => {
                                    const Icon = mode.icon;
                                    const active = mode.id === trainingModeId;
                                    return (
                                        <button
                                            key={mode.id}
                                            type="button"
                                            disabled={!canChangeMode}
                                            onClick={() => applyTrainingMode(mode.id)}
                                            className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${active
                                                ? 'border-blue-500 bg-blue-50 text-blue-800'
                                                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200'
                                            } ${!canChangeMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <Icon className="w-5 h-5 shrink-0" />
                                            <div>
                                                <div className="font-bold">{mode.label}</div>
                                                <div className="text-xs text-gray-500">{mode.description}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {!canChangeMode && (
                                <p className="mt-2 text-xs text-amber-600 font-medium">หยุดหรือพักก่อนเปลี่ยนโหมด</p>
                            )}
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                มุมงอเข่าเป้าหมาย: <span className="text-blue-600 font-bold">{targetFlexionDeg}°</span>
                            </label>
                            <input
                                type="range"
                                min="30"
                                max="90"
                                value={targetFlexionDeg}
                                onChange={(event) => setTargetFlexionDeg(Number(event.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>30°</span>
                                <span>90°</span>
                            </div>
                        </div>

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
                                onChange={(event) => setTotalReps(Number(event.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setSoundEnabled((previous) => !previous)}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${soundEnabled ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}
                            >
                                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                                <span className="text-sm font-medium">เสียง</span>
                            </button>
                            <button
                                onClick={() => setVibrationEnabled((previous) => !previous)}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${vibrationEnabled ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}
                            >
                                <Vibrate className="w-5 h-5" />
                                <span className="text-sm font-medium">สั่น</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="flex-1 p-4 lg:p-12 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
                <div className="flex justify-center items-end relative" style={{ height: isWideScreen ? '70vh' : '55vh', minHeight: isWideScreen ? '500px' : '340px' }}>
                    {gameState === GAME_STATES.COMPLETED && (
                        <div
                            className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-emerald-400/95 to-teal-500/95 backdrop-blur-sm"
                            style={{ animation: 'fadeInScale 0.4s ease-out both' }}
                        >
                            <div className="text-6xl mb-4 animate-bounce">🎉</div>
                            <div className="text-3xl font-black text-white tracking-tight mb-1">Mission Complete!</div>
                            <div className="text-white/80 font-semibold text-lg mb-6">
                                {totalReps} ครั้ง สำเร็จแล้ว!
                            </div>
                            <div className="flex gap-6 mb-8">
                                <div className="bg-white/20 rounded-2xl px-5 py-3 text-center">
                                    <div className="text-2xl font-black text-white">{reps}</div>
                                    <div className="text-white/70 text-xs font-bold uppercase tracking-wider">ครั้ง</div>
                                </div>
                                <div className="bg-white/20 rounded-2xl px-5 py-3 text-center">
                                    <div className="text-2xl font-black text-white">{formatTime(sessionTime)}</div>
                                    <div className="text-white/70 text-xs font-bold uppercase tracking-wider">เวลา</div>
                                </div>
                                <div className="bg-white/20 rounded-2xl px-5 py-3 text-center">
                                    <div className="text-2xl font-black text-white">{averageFlexionDeg.toFixed(0)}</div>
                                    <div className="text-white/70 text-xs font-bold uppercase tracking-wider">Avg °</div>
                                </div>
                            </div>
                            <button
                                onClick={resetSession}
                                className="bg-white text-emerald-600 font-black text-lg px-8 py-3 rounded-2xl shadow-xl hover:scale-105 transition-transform"
                            >
                                เล่นอีกครั้ง
                            </button>
                        </div>
                    )}

                    <div className="relative h-full w-full max-w-sm mx-auto flex justify-center">
                        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between py-4 text-sm font-bold text-gray-400">
                            {(isWideScreen ? [100, 80, 60, 40, 20, 0] : [100, 75, 50, 25, 0]).map((val) => (
                                <span key={val} className="relative">
                                    {val}
                                    <span className="absolute left-6 top-1/2 w-4 h-[2px] bg-gray-200" />
                                </span>
                            ))}
                        </div>

                        <div className={`relative w-32 lg:w-40 h-full bg-gray-100/50 rounded-full overflow-hidden border-8 border-white shadow-2xl ${getGaugeGlow()} transition-all duration-300 ml-12`}>
                            <div
                                className="absolute inset-0 opacity-10"
                                style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px)', backgroundSize: '100% 10%' }}
                            />

                            <div
                                className="absolute left-0 right-0 border-t-4 border-dashed border-red-500 z-20"
                                style={{ bottom: `${targetLinePercent}%` }}
                            >
                                <span className="absolute -right-28 -top-4 text-sm font-bold text-white bg-red-500 px-3 py-1 rounded shadow-lg">
                                    TARGET {targetFlexionDeg}°
                                </span>
                            </div>

                            <div
                                className={`absolute bottom-0 left-0 right-0 transition-all duration-150 ease-out ${getGaugeColor()}`}
                                style={{
                                    height: `${displayFlexionPercent}%`,
                                    opacity: gaugeState === 'IDLE' ? 0.9 : 1,
                                }}
                            >
                                <div className="absolute inset-0 overflow-hidden">
                                    <div className="absolute w-4 h-4 bg-white/20 rounded-full animate-bounce" style={{ left: '20%', top: '30%' }} />
                                    <div className="absolute w-6 h-6 bg-white/10 rounded-full animate-bounce" style={{ left: '60%', top: '50%', animationDelay: '0.3s' }} />
                                </div>
                                <div className="absolute top-0 left-0 right-0 h-2 bg-white/30" />
                            </div>

                            <div className="absolute top-0 left-2 w-4 h-[90%] bg-gradient-to-r from-white/40 to-transparent rounded-full z-30" />
                        </div>

                        <div className="absolute right-0 lg:-right-12 top-1/2 -translate-y-1/2 z-40">
                            <div className={`bg-white rounded-3xl shadow-xl p-4 transition-all duration-200 border-2 flex flex-col items-center justify-center ${gaugeState === 'SUCCESS' ? 'border-emerald-400 scale-110' : 'border-white'}`}>
                                <div className="text-sm text-gray-400 mb-1 font-bold uppercase tracking-wide text-center">Knee Flexion</div>
                                <div className={`text-5xl font-black tabular-nums ${gaugeState === 'SUCCESS' ? 'text-emerald-500' : gaugeState === 'APPROACHING' ? 'text-amber-500' : 'text-blue-500'}`}>
                                    {Math.floor(displayFlexionDeg)}
                                    <span className="text-xl text-gray-400 ml-1">.{Math.round((displayFlexionDeg % 1) * 10)}°</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-8 w-full">
                    <div className="bg-white rounded-[2rem] shadow-xl p-6 lg:p-8 relative overflow-hidden">
                        <div className="flex justify-between items-end mb-2">
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

                        <div className="mb-4 flex items-center justify-between text-xs font-semibold text-gray-500">
                            <span>Mode: <span className="text-blue-600">{trainingMode.displayLabel}</span></span>
                            <span>{activeLegLabel}</span>
                        </div>

                        {!hasLegPair && (
                            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700">
                                เชื่อม Thigh + Shank ข้างเดียวกันก่อนเริ่ม
                            </div>
                        )}

                        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500 ease-out"
                                style={{ width: `${totalReps > 0 ? (reps / totalReps) * 100 : 0}%` }}
                            />
                        </div>
                        <div className="mt-2 text-right text-sm font-bold text-gray-400">
                            {totalReps > 0 ? Math.round((reps / totalReps) * 100) : 0}% Complete
                        </div>
                    </div>

                    <div className="hidden lg:grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-3xl shadow-lg p-5 flex flex-col items-center justify-center">
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">Average Flexion</div>
                            <div className={`text-4xl lg:text-5xl font-black ${averageFlexionToneClass}`}>
                                {averageFlexionDeg.toFixed(1)}<span className="text-2xl text-gray-400 ml-1">°</span>
                            </div>
                            <div className="mt-2 text-xs font-bold px-2 py-1 bg-gray-100 rounded text-gray-500">
                                {averageFlexionCountRef.current > 0 ? 'Live average per rep' : 'Waiting for first rep'}
                            </div>
                        </div>

                        <div className="bg-white rounded-3xl shadow-lg p-5 flex flex-col items-center justify-center">
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">Target</div>
                            <div className="text-4xl lg:text-5xl font-black text-gray-800">
                                {targetFlexionDeg}<span className="text-2xl text-gray-400">°</span>
                            </div>
                            <button
                                type="button"
                                className="mt-2 text-xs font-bold text-blue-500 cursor-pointer hover:underline"
                                onClick={() => setShowSettings(true)}
                            >
                                Adjust Settings
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-auto">
                        {gameState === GAME_STATES.READY && (
                            <button
                                onClick={startSession}
                                disabled={!hasLegPair}
                                className="col-span-2 py-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xl rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
                            >
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
                        onClick={() => navigate('/game/stepping-stones')}
                        className="w-full py-4 border-2 border-blue-200 bg-white hover:bg-blue-50 text-blue-700 font-black text-lg rounded-2xl shadow-lg transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                    >
                        <span>Next: Stepping Stones</span>
                        <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            </main>
        </div>
    );
};

export default GameKneeFlexion;
