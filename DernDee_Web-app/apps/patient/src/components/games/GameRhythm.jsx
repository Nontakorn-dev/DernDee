import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCalibratedGaitProcessorClient } from '@shared/gait/gaitProcessorClient.js';
import { RealtimeStepDetector } from '@shared/gait/realtimeStepDetector.js';
import { GaitSessionAnalyzer } from '@shared/gait/sessionAnalyzer.js';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { createRealtimeConnection } from '@shared/gateway/realtimeTransport.js';
import {
    getRealtimeSensorLabel,
    normalizeRealtimeSensorSample,
} from '@shared/gateway/realtimeSensorUtils.js';
import { usePersistedGatewaySession } from '@shared/hooks/usePersistedGatewaySession.js';
import { resolveVisibleShankSensorKeys, sortGaitSensorStates } from '@shared/gait/gaitSensorSelection.js';
import { getGameAudioContext, unlockGameAudio } from '@shared/audio/unlockGameAudio.js';
import { ArrowLeft, Settings, Music, Play, Pause, Square, X, Volume2, VolumeX, Activity, ArrowRight } from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

// === CONSTANTS ===
const GAME_STATES = {
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED'
};

const DEFAULT_BPM = 50;
const TARGET_SCORE = 1000;
const ANALYSIS_INTERVAL_MS = 1000;
const MIN_ANALYSIS_SAMPLES = 300;
const RHYTHM_JUDGMENT_OFFSET_MS = 200;
const MAX_VISIBLE_SENSORS = 2;
const SENSOR_STALE_AFTER_MS = 2500;
const EPOCH_THRESHOLD_MS = 946684800000;

function getTimingThresholds(bpm) {
    const beatInterval = 60000 / bpm;
    return {
        perfect: Math.min(240, beatInterval * 0.26),
        good: Math.min(380, beatInterval * 0.43),
        assist: Math.min(500, beatInterval * 0.55)
    };
}

function getRhythmJudgmentOffsetMs(audioContext) {
    const measuredLatencyMs = (((audioContext?.baseLatency ?? 0) + (audioContext?.outputLatency ?? 0)) * 1000);
    if (Number.isFinite(measuredLatencyMs) && measuredLatencyMs > 0) {
        return Math.max(RHYTHM_JUDGMENT_OFFSET_MS, measuredLatencyMs);
    }
    return RHYTHM_JUDGMENT_OFFSET_MS;
}

function averageMetric(values) {
    const numericValues = values.filter(Number.isFinite);
    if (!numericValues.length) {
        return null;
    }

    return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
}

function isAbsoluteTimestampMs(timestampMs) {
    return Number.isFinite(timestampMs) && timestampMs >= EPOCH_THRESHOLD_MS;
}

function updateSensorClockOffset(sensorState, packetTimestampMs, arrivalTimeMs) {
    if (!Number.isFinite(packetTimestampMs) || isAbsoluteTimestampMs(packetTimestampMs)) {
        sensorState.lastPacketTimestampMs = packetTimestampMs;
        return;
    }

    const nextOffsetMs = arrivalTimeMs - packetTimestampMs;
    if (
        !Number.isFinite(sensorState.packetClockOffsetMs)
        || (
            Number.isFinite(sensorState.lastPacketTimestampMs)
            && packetTimestampMs < sensorState.lastPacketTimestampMs - 1000
        )
    ) {
        sensorState.packetClockOffsetMs = nextOffsetMs;
    } else {
        sensorState.packetClockOffsetMs += (nextOffsetMs - sensorState.packetClockOffsetMs) * 0.15;
    }

    sensorState.lastPacketTimestampMs = packetTimestampMs;
}

function resolveDetectedStepTimeMs(sensorState, eventTimestampMs, fallbackTimeMs) {
    if (!Number.isFinite(eventTimestampMs)) {
        return fallbackTimeMs;
    }

    if (isAbsoluteTimestampMs(eventTimestampMs) && Number.isFinite(performance.timeOrigin)) {
        return eventTimestampMs - performance.timeOrigin;
    }

    if (Number.isFinite(sensorState.packetClockOffsetMs)) {
        return eventTimestampMs + sensorState.packetClockOffsetMs;
    }

    return fallbackTimeMs;
}

const GameRhythm = () => {
    const navigate = useNavigate();
    const { user } = useUserAuth();

    // === Game State ===
    const [gameState, setGameState] = useState(GAME_STATES.READY);
    const gameStateRef = useRef(GAME_STATES.READY);
    const [showSettings, setShowSettings] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);

    // === Tempo Settings ===
    const [bpm, setBpm] = useState(DEFAULT_BPM);
    const bpmRef = useRef(DEFAULT_BPM);

    // === Rhythm State ===
    const [isPulsing, setIsPulsing] = useState(false);
    const [beatCount, setBeatCount] = useState(0);
    const [feedbackState, setFeedbackState] = useState('waiting'); // waiting, perfect, good, miss
    const [feedbackText, setFeedbackText] = useState('');
    const [nextBeatCountdownMs, setNextBeatCountdownMs] = useState(0);
    const [beatProgress, setBeatProgress] = useState(0);
    const [timingHint, setTimingHint] = useState('กด Start เพื่อเริ่ม');
    const [lastTimingLabel, setLastTimingLabel] = useState('รอฟังจังหวะก่อนลงเท้า');
    const [lastTimingOffsetMs, setLastTimingOffsetMs] = useState(null);

    // === Metrics ===
    const [cadence, setCadence] = useState(0); // Steps per minute
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [sessionTime, setSessionTime] = useState(0);
    const [detectedSteps, setDetectedSteps] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [sessionMetrics, setSessionMetrics] = useState({});

    // === Timing Refs ===
    const nextBeatTimeRef = useRef(0);
    const lastJudgedBeatTimeRef = useRef(null);
    const lastStepTimeRef = useRef(0);
    const stepTimesRef = useRef([]); // For cadence calculation
    const beatTimerRef = useRef(null);
    const guideTimerRef = useRef(null);
    const sessionTimerRef = useRef(null);
    const audioContextRef = useRef(null);
    const feedbackTimerRef = useRef(null);
    const manualDisconnectRef = useRef(false);
    const analysisTimerRef = useRef(null);
    const sensorRuntimesRef = useRef(new Map());
    const activeSensorKeysRef = useRef([]);

    // === WebSocket ===
    const wsRef = useRef(null);

    const getVisibleSensorStates = useCallback(() => {
        return activeSensorKeysRef.current
            .map((sensorKey) => sensorRuntimesRef.current.get(sensorKey))
            .filter(Boolean)
            .sort(sortGaitSensorStates);
    }, []);

    const syncAggregatedSessionMetrics = useCallback(() => {
        const visibleSensorStates = getVisibleSensorStates();
        const summaries = visibleSensorStates
            .map((sensorState) => sensorState.latestSummary)
            .filter(Boolean);

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
            symmetry_percent: averageMetric(summaries.map((summary) => summary.symmetryPercent)),
        });
    }, [getVisibleSensorStates]);

    const syncVisibleSensorViews = useCallback(() => {
        activeSensorKeysRef.current = resolveVisibleShankSensorKeys(
            Array.from(sensorRuntimesRef.current.values()),
            { staleAfterMs: SENSOR_STALE_AFTER_MS, maxVisibleSensors: MAX_VISIBLE_SENSORS },
        );
        const visibleSensorStates = getVisibleSensorStates();
        return visibleSensorStates;
    }, [getVisibleSensorStates]);

    const destroySensorRuntime = useCallback((sensorState) => {
        sensorState.unsubscribeParams?.();
        sensorState.processor?.destroy?.();
    }, []);

    const createSensorRuntime = useCallback((sample) => {
        const processor = createCalibratedGaitProcessorClient(sample.sensorKey);
        const stepDetector = new RealtimeStepDetector({ sensorMount: sample.sensorMount || 'shank' });
        const sessionAnalyzer = new GaitSessionAnalyzer();
        const sensorState = {
            sensorKey: sample.sensorKey,
            label: getRealtimeSensorLabel(sample),
            side: sample.side || null,
            sensorMount: sample.sensorMount || 'unknown',
            lastSeenAt: Date.now(),
            packetClockOffsetMs: null,
            lastPacketTimestampMs: null,
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
        });

        sensorRuntimesRef.current.set(sample.sensorKey, sensorState);
        return sensorState;
    }, [syncAggregatedSessionMetrics]);

    const resetDerivedAnalysis = useCallback(() => {
        sensorRuntimesRef.current.forEach((sensorState) => {
            destroySensorRuntime(sensorState);
        });
        sensorRuntimesRef.current.clear();
        activeSensorKeysRef.current = [];
        setSessionMetrics({});
    }, [destroySensorRuntime]);

    const buildSessionSummary = useCallback(() => {
        const rhythmProgress = Math.round(Math.max(0, Math.min(100, (score / TARGET_SCORE) * 100)));

        return {
            total_steps: Number.isFinite(sessionMetrics?.total_steps) ? sessionMetrics.total_steps : detectedSteps,
            avg_speed_mps: Number.isFinite(sessionMetrics?.avg_speed_mps) ? sessionMetrics.avg_speed_mps : null,
            cadence_spm: Number.isFinite(sessionMetrics?.cadence_spm) ? sessionMetrics.cadence_spm : cadence,
            avg_step_length_m: Number.isFinite(sessionMetrics?.avg_step_length_m) ? sessionMetrics.avg_step_length_m : null,
            avg_stride_length_m: Number.isFinite(sessionMetrics?.avg_stride_length_m) ? sessionMetrics.avg_stride_length_m : null,
            avg_clearance_m: Number.isFinite(sessionMetrics?.avg_clearance_m) ? sessionMetrics.avg_clearance_m : null,
            symmetry_score: Number.isFinite(sessionMetrics?.symmetry_percent) ? sessionMetrics.symmetry_percent : rhythmProgress,
        };
    }, [cadence, detectedSteps, score, sessionMetrics]);

    const buildSessionDetails = useCallback(() => {
        return {
            score,
            target_score: TARGET_SCORE,
            best_streak: bestStreak,
            target_bpm: bpm,
            detected_steps: detectedSteps,
            beat_count: beatCount,
        };
    }, [beatCount, bestStreak, bpm, detectedSteps, score]);

    const { endSessionIfActive } = usePersistedGatewaySession({
        wsRef,
        userId: user?.uid,
        isConnected,
        shouldStart: gameState === GAME_STATES.PLAYING,
        shouldComplete: gameState === GAME_STATES.COMPLETED,
        sessionType: 'rhythm_drummer',
        buildSummary: buildSessionSummary,
        buildDetails: buildSessionDetails,
        metadata: {
            game_label: 'Rhythm Drummer',
        },
    });

    // === Initialize Audio Context ===
    useEffect(() => {
        audioContextRef.current = getGameAudioContext(audioContextRef.current);

        const unlock = () => {
            audioContextRef.current = unlockGameAudio(audioContextRef.current);
        };

        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('touchend', unlock, true);
        document.addEventListener('visibilitychange', unlock);

        return () => {
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('touchend', unlock, true);
            document.removeEventListener('visibilitychange', unlock);
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    // === Play Tick Sound ===
    const playTickSound = useCallback(() => {
        if (!soundEnabled || !audioContextRef.current) return;

        const ctx = audioContextRef.current;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = 800; // Hz
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
    }, [soundEnabled]);

    // === Play Success Sound ===
    const playSuccessSound = useCallback((targetBeatTimeMs = null) => {
        if (!soundEnabled || !audioContextRef.current) return;

        const ctx = audioContextRef.current;
        const startTime = targetBeatTimeMs !== null
            ? Math.max(ctx.currentTime, ctx.currentTime + Math.max(0, (targetBeatTimeMs - performance.now()) / 1000))
            : ctx.currentTime;

        const fundamental = ctx.createOscillator();
        const harmonic = ctx.createOscillator();
        const gainNode = ctx.createGain();

        fundamental.connect(gainNode);
        harmonic.connect(gainNode);
        gainNode.connect(ctx.destination);

        fundamental.frequency.value = 659.25; // E5
        fundamental.type = 'triangle';
        harmonic.frequency.value = 987.77; // B5
        harmonic.type = 'sine';

        gainNode.gain.setValueAtTime(0.001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.7, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.18);

        fundamental.start(startTime);
        harmonic.start(startTime);
        fundamental.stop(startTime + 0.18);
        harmonic.stop(startTime + 0.18);
    }, [soundEnabled]);

    const registerDetectedStep = useCallback((stepTimeMs = performance.now()) => {
        const now = stepTimeMs;
        if (now - lastStepTimeRef.current < 300) {
            return;
        }

        lastStepTimeRef.current = now;
        setDetectedSteps(prev => prev + 1);

        stepTimesRef.current.push(now);
        if (stepTimesRef.current.length > 10) {
            stepTimesRef.current.shift();
        }

        const beatInterval = 60000 / bpmRef.current;
        const lastBeatTime = nextBeatTimeRef.current - beatInterval;
        const nextBeat = nextBeatTimeRef.current;
        const thresholds = getTimingThresholds(bpmRef.current);
        const errorToLast = Math.abs(now - lastBeatTime);
        const errorToNext = Math.abs(now - nextBeat);
        const error = Math.min(errorToLast, errorToNext);
        const targetBeatTime = errorToLast <= errorToNext ? lastBeatTime : nextBeat;
        const signedError = Math.round(now - targetBeatTime);

        if (
            lastJudgedBeatTimeRef.current !== null
            && Math.abs(targetBeatTime - lastJudgedBeatTimeRef.current) < beatInterval * 0.5
        ) {
            return;
        }

        lastJudgedBeatTimeRef.current = targetBeatTime;
        setLastTimingOffsetMs(signedError);

        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
        }

        if (error <= thresholds.perfect) {
            setFeedbackState('perfect');
            setFeedbackText('Perfect!');
            setLastTimingLabel(`ลงเท้าตรงจังหวะแล้ว (${Math.round(error)} ms)`);
            setStreak(prev => {
                const nextStreak = prev + 1;
                setBestStreak(best => Math.max(best, nextStreak));
                setScore(scorePrev => scorePrev + 30);
                return nextStreak;
            });
            playSuccessSound(targetBeatTime);
        } else if (error <= thresholds.good) {
            setFeedbackState('good');
            setFeedbackText('Good!');
            setLastTimingLabel(`ตามจังหวะดีแล้ว (${Math.round(error)} ms)`);
            setStreak(prev => {
                const nextStreak = prev + 1;
                setBestStreak(best => Math.max(best, nextStreak));
                setScore(scorePrev => scorePrev + 20);
                return nextStreak;
            });
        } else if (error <= thresholds.assist) {
            setFeedbackState('close');
            setFeedbackText('On Beat');
            setLastTimingLabel(`ทันจังหวะแล้ว (${Math.round(error)} ms)`);
            setStreak(prev => {
                const nextStreak = prev + 1;
                setBestStreak(best => Math.max(best, nextStreak));
                setScore(scorePrev => scorePrev + 10);
                return nextStreak;
            });
        } else {
            const isEarly = signedError < 0;
            setFeedbackState('miss');
            setFeedbackText(isEarly ? 'เร็วไป' : 'ช้าไป');
            setLastTimingLabel(`${isEarly ? 'เร็วไป' : 'ช้าไป'} ${Math.abs(signedError)} ms`);
            setStreak(0);
        }

        feedbackTimerRef.current = setTimeout(() => {
            setFeedbackState('waiting');
            setFeedbackText('');
        }, 500);

        if (stepTimesRef.current.length >= 2) {
            const intervals = [];
            for (let i = 1; i < stepTimesRef.current.length; i++) {
                intervals.push(stepTimesRef.current[i] - stepTimesRef.current[i - 1]);
            }
            const avgInterval = intervals.reduce((total, interval) => total + interval, 0) / intervals.length;
            setCadence(Math.round(60000 / avgInterval));
        }
    }, [playSuccessSound]);

    // === Metronome Beat ===
    const triggerBeat = useCallback(() => {
        const now = performance.now();
        const beatInterval = 60000 / bpmRef.current;
        const judgmentOffsetMs = getRhythmJudgmentOffsetMs(audioContextRef.current);

        // Schedule next beat
        nextBeatTimeRef.current = now + beatInterval + judgmentOffsetMs;
        setNextBeatCountdownMs(Math.round(beatInterval + judgmentOffsetMs));
        setBeatProgress(0);

        // Visual pulse
        setIsPulsing(true);
        setTimeout(() => setIsPulsing(false), 200);

        // Play tick
        playTickSound();

        // Increment beat count
        setBeatCount(prev => prev + 1);

    }, [playTickSound]);

    // === Start Metronome ===
    const startMetronome = useCallback(() => {
        const beatInterval = 60000 / bpmRef.current;

        // First beat immediately
        triggerBeat();

        // Subsequent beats
        beatTimerRef.current = setInterval(() => {
            if (gameStateRef.current === GAME_STATES.PLAYING) {
                triggerBeat();
            }
        }, beatInterval);
    }, [triggerBeat]);

    // === Stop Metronome ===
    const stopMetronome = useCallback(() => {
        if (beatTimerRef.current) {
            clearInterval(beatTimerRef.current);
            beatTimerRef.current = null;
        }
    }, []);

    const stopGuideTimer = useCallback(() => {
        if (guideTimerRef.current) {
            clearInterval(guideTimerRef.current);
            guideTimerRef.current = null;
        }
    }, []);

    // === WebSocket Connection ===
    useEffect(() => {
        manualDisconnectRef.current = false;
        resetDerivedAnalysis();

        const connectWebSocket = () => {
            try {
                wsRef.current = createRealtimeConnection();

                wsRef.current.onopen = () => {
                    console.log('🎵 Rhythm Game connected to WebSocket');
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
                    resetDerivedAnalysis();

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
        };
    }, [destroySensorRuntime]);

    // === Handle Sensor Data (Step Detection) ===
    const handleSensorData = useCallback((msg) => {
        if (msg.type !== 'DATA') return;

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
        updateSensorClockOffset(sensorState, sample.timestamp_ms, performance.now());

        syncVisibleSensorViews();
        if (!activeSensorKeysRef.current.includes(sample.sensorKey)) {
            return;
        }

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

        const detectorResult = sensorState.stepDetector?.update({
            gx: sample.gx,
            gy: sample.gy,
            gz: sample.gz,
            timestampMs: sample.timestamp_ms,
        });

        if (detectorResult?.event === 'HEEL_STRIKE') {
            registerDetectedStep(resolveDetectedStepTimeMs(
                sensorState,
                detectorResult.eventTimestampMs,
                performance.now(),
            ));
        }
    }, [createSensorRuntime, registerDetectedStep, syncVisibleSensorViews]);

    // === Auto Complete When Score Reaches Goal ===
    useEffect(() => {
        if (gameState !== GAME_STATES.PLAYING || score < TARGET_SCORE) {
            return;
        }

        setGameState(GAME_STATES.COMPLETED);
        gameStateRef.current = GAME_STATES.COMPLETED;
        stopMetronome();
        stopGuideTimer();
    }, [gameState, score, stopGuideTimer, stopMetronome]);

    // === Beat Guide ===
    useEffect(() => {
        stopGuideTimer();

        if (gameState !== GAME_STATES.PLAYING) {
            setNextBeatCountdownMs(0);
            setBeatProgress(0);
            setTimingHint('กด Start เพื่อเริ่ม');
            return;
        }

        guideTimerRef.current = setInterval(() => {
            if (!nextBeatTimeRef.current) return;

            const now = performance.now();
            const beatInterval = 60000 / bpmRef.current;
            const thresholds = getTimingThresholds(bpmRef.current);
            const remaining = Math.max(0, nextBeatTimeRef.current - now);
            const progress = Math.max(0, Math.min(1, 1 - (remaining / beatInterval)));

            setNextBeatCountdownMs(Math.round(remaining));
            setBeatProgress(progress);

            if (remaining <= thresholds.perfect) {
                setTimingHint('ลงเท้าตอนนี้');
            } else if (remaining <= thresholds.good) {
                setTimingHint('เตรียมลงเท้า');
            } else if (remaining <= thresholds.assist) {
                setTimingHint('ตามเสียงไว้');
            } else {
                setTimingHint('รอบีตถัดไป');
            }
        }, 50);

        return () => {
            stopGuideTimer();
        };
    }, [gameState, bpm, stopGuideTimer]);

    // === Session Timer ===
    useEffect(() => {
        if (gameState === GAME_STATES.PLAYING) {
            sessionTimerRef.current = setInterval(() => {
                setSessionTime(prev => prev + 1);
            }, 1000);
        } else {
            if (sessionTimerRef.current) {
                clearInterval(sessionTimerRef.current);
            }
        }

        return () => {
            if (sessionTimerRef.current) {
                clearInterval(sessionTimerRef.current);
            }
        };
    }, [gameState]);

    // === Sync BPM ref ===
    useEffect(() => {
        bpmRef.current = bpm;
    }, [bpm]);

    // === Game Controls ===
    const startSession = () => {
        audioContextRef.current = unlockGameAudio(getGameAudioContext(audioContextRef.current));

        setGameState(GAME_STATES.PLAYING);
        gameStateRef.current = GAME_STATES.PLAYING;
        setSessionTime(0);
        setScore(0);
        setStreak(0);
        setBestStreak(0);
        setBeatCount(0);
        setCadence(0);
        setDetectedSteps(0);
        setSessionMetrics({});
        resetDerivedAnalysis();
        setNextBeatCountdownMs(Math.round(60000 / bpmRef.current));
        setBeatProgress(0);
        setTimingHint('ฟังจังหวะแล้วค่อยลงเท้า');
        setLastTimingLabel('รอฟังจังหวะก่อนลงเท้า');
        setLastTimingOffsetMs(null);
        setFeedbackState('waiting');
        setFeedbackText('');
        stepTimesRef.current = [];
        lastStepTimeRef.current = 0;
        lastJudgedBeatTimeRef.current = null;

        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
        }

        startMetronome();
    };

    const pauseSession = () => {
        setGameState(GAME_STATES.PAUSED);
        gameStateRef.current = GAME_STATES.PAUSED;
        stopMetronome();
        stopGuideTimer();
    };

    const resumeSession = () => {
        audioContextRef.current = unlockGameAudio(getGameAudioContext(audioContextRef.current));
        setGameState(GAME_STATES.PLAYING);
        gameStateRef.current = GAME_STATES.PLAYING;
        lastJudgedBeatTimeRef.current = null;
        startMetronome();
    };

    const stopSession = () => {
        setGameState(GAME_STATES.COMPLETED);
        gameStateRef.current = GAME_STATES.COMPLETED;
        stopMetronome();
        stopGuideTimer();
    };

    const resetSession = useCallback(() => {
        setGameState(GAME_STATES.READY);
        gameStateRef.current = GAME_STATES.READY;
        setSessionTime(0);
        setScore(0);
        setStreak(0);
        setBestStreak(0);
        setBeatCount(0);
        setCadence(0);
        setDetectedSteps(0);
        setSessionMetrics({});
        resetDerivedAnalysis();
        setNextBeatCountdownMs(0);
        setBeatProgress(0);
        setTimingHint('กด Start เพื่อเริ่ม');
        setLastTimingLabel('รอฟังจังหวะก่อนลงเท้า');
        setLastTimingOffsetMs(null);
        setFeedbackState('waiting');
        setFeedbackText('');
        stepTimesRef.current = [];
        lastStepTimeRef.current = 0;
        lastJudgedBeatTimeRef.current = null;
        nextBeatTimeRef.current = 0;
        stopGuideTimer();

        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
            feedbackTimerRef.current = null;
        }
    }, [resetDerivedAnalysis, stopGuideTimer]);

    // === Format Time ===
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // === Get Ring Colors ===
    const getRingColor = () => {
        switch (feedbackState) {
            case 'perfect': return 'ring-emerald-400 bg-emerald-500/20';
            case 'good': return 'ring-amber-400 bg-amber-500/20';
            case 'close': return 'ring-sky-400 bg-sky-500/20';
            case 'miss': return 'ring-gray-400 bg-gray-500/20';
            default: return 'ring-blue-400 bg-blue-500/20';
        }
    };

    const getRingGlow = () => {
        if (feedbackState === 'perfect') {
            return 'shadow-[0_0_50px_rgba(16,185,129,0.5)]';
        }
        if (feedbackState === 'close') {
            return 'shadow-[0_0_35px_rgba(56,189,248,0.35)]';
        }
        if (isPulsing) {
            return 'shadow-[0_0_30px_rgba(59,130,246,0.4)]';
        }
        return '';
    };

    const timingThresholds = getTimingThresholds(bpm);
    const beatIntervalMs = 60000 / bpm;
    const assistZoneStartPercent = Math.max(0, Math.min(100, (1 - (timingThresholds.assist / beatIntervalMs)) * 100));
    const guideProgressPercent = Math.max(0, Math.min(100, beatProgress * 100));
    const scoreProgressPercent = Math.max(0, Math.min(100, (score / TARGET_SCORE) * 100));
    const goalReached = score >= TARGET_SCORE;

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
                    {/* <h1 className="text-xl sm:text-2xl font-extrabold text-gray-800">Rhythm</h1>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium">Cadence Training</p> */}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`p-2 rounded-full transition-colors ${soundEnabled ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                            }`}
                    >
                        {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
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
                            <h3 className="text-xl font-extrabold text-gray-800">Tempo Settings</h3>
                            <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* BPM Slider */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Tempo: <span className="text-blue-600 font-extrabold text-xl">{bpm} BPM</span>
                            </label>
                            <input
                                type="range"
                                min="40"
                                max="120"
                                value={bpm}
                                onChange={(e) => setBpm(Number(e.target.value))}
                                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>40 (Slow)</span>
                                <span>70</span>
                                <span>120 (Fast)</span>
                            </div>
                        </div>

                        {/* Preset Buttons */}
                        <div className="grid grid-cols-3 gap-2">
                            {[45, 50, 60].map(preset => (
                                <button
                                    key={preset}
                                    onClick={() => setBpm(preset)}
                                    className={`py-2 rounded-lg font-medium transition-all ${bpm === preset
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {preset} BPM
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 p-4 lg:p-12 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-start">

                {/* LEFT: Rhythm Ring (Visual) */}
                <div className="lg:col-span-8 flex flex-col items-center justify-center min-h-[50vh] lg:min-h-[70vh]">
                    <div className="w-full max-w-2xl mb-6 lg:mb-8 px-1 sm:px-2">
                        <div className="relative h-5 sm:h-6 rounded-full overflow-hidden bg-white/85 border border-blue-100 shadow-lg">
                            <div
                                className="absolute inset-y-0 right-0 bg-emerald-100/90"
                                style={{ left: `${assistZoneStartPercent}%` }}
                            ></div>
                            <div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 transition-all duration-75"
                                style={{ width: `${guideProgressPercent}%` }}
                            ></div>
                            <div
                                className="absolute top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-white/90 shadow"
                                style={{ left: `calc(${guideProgressPercent}% - 2px)` }}
                            ></div>
                        </div>
                    </div>

                    {/* Timer (Mobile Only) */}
                    <div className="lg:hidden text-center mb-6">
                        <span className="text-4xl font-extrabold tracking-tight text-gray-800">
                            {formatTime(sessionTime)}
                        </span>
                    </div>

                    {/* Rhythm Ring Display */}
                    <div className="relative w-64 h-64 sm:w-80 sm:h-80 lg:w-[500px] lg:h-[500px] flex items-center justify-center">
                        {/* Background Rings */}
                        <div className={`absolute inset-0 rounded-full border-4 ${feedbackState === 'perfect' ? 'border-emerald-200' : 'border-gray-100'} animate-ping opacity-20`}></div>
                        <div className="absolute inset-4 rounded-full border-2 border-gray-100"></div>
                        <div className="absolute inset-16 rounded-full border border-gray-50"></div>

                        {/* Tempo Ring (Pulsing) */}
                        <div className={`absolute inset-0 rounded-full border-8 transition-all duration-100 ease-out z-10 ${isPulsing ? 'border-emerald-400 scale-105 shadow-[0_0_50px_rgba(52,211,153,0.5)]' :
                            'border-blue-100 scale-100 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                            }`}></div>

                        {/* Center Hub */}
                        <div className={`relative w-32 h-32 lg:w-48 lg:h-48 rounded-full shadow-2xl flex items-center justify-center z-20 transition-all duration-150 ${isPulsing ? 'bg-emerald-500 scale-110' : 'bg-white shadow-[0_0_40px_rgba(59,130,246,0.25)]'
                            }`}>
                            {isPulsing ? (
                                <Music className="w-12 h-12 lg:w-20 lg:h-20 text-white animate-bounce" />
                            ) : (
                                <div className="relative w-full h-full flex items-center justify-center rounded-full overflow-hidden">
                                    {/* Ambient Icon Background */}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                                        <Music className="w-24 h-24 text-blue-600" />
                                    </div>

                                    {/* Content */}
                                    <div className="text-center flex flex-col items-center z-10 relative">
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Tempo</div>
                                        <div className="text-3xl lg:text-4xl font-black text-blue-600">{bpm}</div>
                                        <div className="text-xs text-gray-400 mb-2">BPM</div>

                                        {/* Inline Feedback */}
                                        <div className={`mt-1 font-black text-lg uppercase tracking-wider transition-all duration-200 ${feedbackState === 'perfect' ? 'text-emerald-500 scale-110' :
                                            feedbackState === 'good' ? 'text-amber-500 scale-105' :
                                                feedbackState === 'close' ? 'text-sky-500 scale-105' :
                                                feedbackState === 'miss' ? 'text-red-500' : 'opacity-0'
                                            }`}>
                                            {feedbackState === 'waiting' ? (
                                                <span className="text-[10px] text-blue-300 font-bold animate-pulse">READY</span>
                                            ) :
                                                feedbackState === 'perfect' ? 'Perfect!' :
                                                    feedbackState === 'good' ? 'Good' :
                                                        feedbackState === 'close' ? 'On Beat' : 'Miss'}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>


                    </div>
                </div>

                {/* RIGHT: Dashboard (Stats & Controls) */}
                <div className="lg:col-span-4 flex flex-col gap-6 w-full">

                    {/* Timer & Streak (Desktop) */}
                    <div className="hidden lg:flex flex-col bg-white rounded-3xl shadow-xl p-8 text-center border border-blue-50">
                        <div className="flex justify-between items-center mb-6">
                            <div className="text-left">
                                <div className="text-sm font-bold text-gray-400 uppercase tracking-wider">Time</div>
                                <div className="text-5xl font-black text-gray-800 tabular-nums">
                                    {formatTime(sessionTime)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-gray-400 uppercase tracking-wider">Streak</div>
                                <div className="text-5xl font-black text-emerald-500 tabular-nums">
                                    {streak}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Performance Stats */}
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white rounded-3xl shadow-lg p-6 lg:p-8 text-center border border-blue-50">
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-2">Score</div>
                            <div className="text-4xl lg:text-5xl font-black text-blue-600 tabular-nums">
                                {score}<span className="text-xl lg:text-2xl text-gray-300"> / {TARGET_SCORE}</span>
                            </div>
                            <div className="mt-4 h-3 rounded-full bg-blue-50 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${goalReached ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-emerald-400'}`}
                                    style={{ width: `${scoreProgressPercent}%` }}
                                ></div>
                            </div>
                            <div className={`mt-3 text-sm font-bold ${goalReached ? 'text-emerald-600' : 'text-gray-500'}`}>
                                {goalReached ? 'Goal reached' : `Reach ${TARGET_SCORE} points to clear`}
                            </div>
                        </div>
                    </div>

                    {/* Cadence Display */}
                    <div className="bg-white rounded-3xl shadow-lg p-6 flex items-center justify-between">
                        <div className="text-left">
                            <div className="text-sm text-gray-400 font-bold uppercase tracking-wider">Avg Cadence</div>
                            <div className="text-2xl font-black text-gray-800">
                                {Math.round(cadence)} <span className="text-sm text-gray-400 font-bold">SPM</span>
                            </div>
                        </div>
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white ${Math.abs(cadence - bpm) < 5 ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}>
                            <Activity className="w-6 h-6" />
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col gap-3 mt-auto">
                        {gameState === GAME_STATES.READY && (
                            <button onClick={startSession} className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white font-black text-xl rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3">
                                <Play className="w-8 h-8" /> START RHYTHM
                            </button>
                        )}

                        {gameState === GAME_STATES.PLAYING && (
                            <div className="flex gap-3">
                                <button onClick={pauseSession} className="flex-1 py-5 bg-amber-400 hover:bg-amber-500 text-white font-bold text-lg rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                    <Pause className="w-6 h-6" /> PAUSE
                                </button>
                                <button onClick={stopSession} className="flex-1 py-5 bg-red-500 hover:bg-red-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                    <Square className="w-6 h-6" /> STOP
                                </button>
                            </div>
                        )}

                        {gameState === GAME_STATES.PAUSED && (
                            <div className="flex gap-3">
                                <button onClick={resumeSession} className="flex-1 py-5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                    <Play className="w-6 h-6" /> RESUME
                                </button>
                                <button onClick={stopSession} className="flex-1 py-5 bg-red-500 hover:bg-red-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                    <Square className="w-6 h-6" /> STOP
                                </button>
                            </div>
                        )}

                        {gameState === GAME_STATES.COMPLETED && (
                            <button onClick={resetSession} className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white font-black text-xl rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3">
                                <Play className="w-8 h-8" /> NEW SESSION
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => navigate('/game/knee-flexion')}
                        className="w-full py-4 border-2 border-blue-200 bg-white hover:bg-blue-50 text-blue-700 font-black text-lg rounded-2xl shadow-lg transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                    >
                        <span>Next: Knee Flexion Quest</span>
                        <ArrowRight className="w-5 h-5" />
                    </button>

                    {/* Completion Message */}
                    {gameState === GAME_STATES.COMPLETED && (
                        <div className={`mt-2 rounded-2xl p-4 text-center border-2 ${goalReached ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                            <h3 className={`text-xl font-bold ${goalReached ? 'text-emerald-800' : 'text-amber-800'}`}>
                                {goalReached ? 'Goal Reached!' : 'Session Complete!'}
                            </h3>
                            <p className={goalReached ? 'text-emerald-600' : 'text-amber-600'}>
                                {goalReached ? `ทำคะแนนได้ ${score} / ${TARGET_SCORE}` : `คะแนนล่าสุด ${score} / ${TARGET_SCORE}`}
                            </p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default GameRhythm;
