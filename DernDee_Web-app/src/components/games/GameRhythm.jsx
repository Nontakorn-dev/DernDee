import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Music, Play, Pause, Square, X, Volume2, VolumeX, Activity } from 'lucide-react';
import derndeeLogo from '../../assets/images/derndee-logo.png';

// === CONSTANTS ===
const GAME_STATES = {
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED'
};

// Timing thresholds (ms)
const PERFECT_THRESHOLD = 100;
const GOOD_THRESHOLD = 200;

const GameRhythm = () => {
    const navigate = useNavigate();

    // === Game State ===
    const [gameState, setGameState] = useState(GAME_STATES.READY);
    const gameStateRef = useRef(GAME_STATES.READY);
    const [showSettings, setShowSettings] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);

    // === Tempo Settings ===
    const [bpm, setBpm] = useState(60); // Default 60 BPM
    const bpmRef = useRef(60);

    // === Rhythm State ===
    const [isPulsing, setIsPulsing] = useState(false);
    const [beatCount, setBeatCount] = useState(0);
    const [feedbackState, setFeedbackState] = useState('waiting'); // waiting, perfect, good, miss
    const [feedbackText, setFeedbackText] = useState('');

    // === Metrics ===
    const [cadence, setCadence] = useState(0); // Steps per minute
    const [accuracy, setAccuracy] = useState(100);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [sessionTime, setSessionTime] = useState(0);
    const [perfectCount, setPerfectCount] = useState(0);
    const [goodCount, setGoodCount] = useState(0);
    const [missCount, setMissCount] = useState(0);

    // === Timing Refs ===
    const nextBeatTimeRef = useRef(0);
    const lastStepTimeRef = useRef(0);
    const stepTimesRef = useRef([]); // For cadence calculation
    const beatTimerRef = useRef(null);
    const sessionTimerRef = useRef(null);
    const audioContextRef = useRef(null);

    // === WebSocket ===
    const wsRef = useRef(null);

    // === Initialize Audio Context ===
    useEffect(() => {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        return () => {
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
    const playSuccessSound = useCallback(() => {
        if (!soundEnabled || !audioContextRef.current) return;

        const ctx = audioContextRef.current;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = 523.25; // C5
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.15);
    }, [soundEnabled]);

    // === Metronome Beat ===
    const triggerBeat = useCallback(() => {
        const now = performance.now();
        const beatInterval = 60000 / bpmRef.current;

        // Schedule next beat
        nextBeatTimeRef.current = now + beatInterval;

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

    // === WebSocket Connection ===
    useEffect(() => {
        const connectWebSocket = () => {
            try {
                wsRef.current = new WebSocket(`ws://${window.location.hostname}:8765`);

                wsRef.current.onopen = () => {
                    console.log('🎵 Rhythm Game connected to WebSocket');
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
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    // === Handle Sensor Data (Step Detection) ===
    const handleSensorData = useCallback((msg) => {
        if (msg.type !== 'DATA') return;
        if (gameStateRef.current !== GAME_STATES.PLAYING) return;

        const payload = msg.payload;

        // Detect step from total_steps change or step_detected flag
        const stepDetected = payload.step_detected ||
            (payload.gait_metrics && payload.gait_metrics.step_count > 0);

        if (stepDetected && payload.step_detected) {
            const now = performance.now();

            // Debounce: ignore steps within 300ms of last step
            if (now - lastStepTimeRef.current < 300) return;
            lastStepTimeRef.current = now;

            // Record step time for cadence calculation
            stepTimesRef.current.push(now);
            // Keep only last 10 steps
            if (stepTimesRef.current.length > 10) {
                stepTimesRef.current.shift();
            }

            // Calculate timing error
            const beatInterval = 60000 / bpmRef.current;
            const lastBeatTime = nextBeatTimeRef.current - beatInterval;
            const nextBeat = nextBeatTimeRef.current;

            // Find closest beat
            const errorToLast = Math.abs(now - lastBeatTime);
            const errorToNext = Math.abs(now - nextBeat);
            const error = Math.min(errorToLast, errorToNext);

            // Determine feedback
            if (error <= PERFECT_THRESHOLD) {
                setFeedbackState('perfect');
                setFeedbackText('Perfect!');
                setPerfectCount(prev => prev + 1);
                setStreak(prev => prev + 1);
                setScore(prev => prev + 100 + (streak * 10)); // Bonus for streak
                playSuccessSound();
            } else if (error <= GOOD_THRESHOLD) {
                setFeedbackState('good');
                setFeedbackText('Good!');
                setGoodCount(prev => prev + 1);
                setStreak(prev => prev + 1);
                setScore(prev => prev + 50 + (streak * 5));
            } else {
                setFeedbackState('miss');
                if (now < lastBeatTime + beatInterval / 2) {
                    setFeedbackText('เร็วไป');
                } else {
                    setFeedbackText('ช้าไป');
                }
                setMissCount(prev => prev + 1);
                setStreak(0);
            }

            // Clear feedback after 500ms
            setTimeout(() => {
                setFeedbackState('waiting');
                setFeedbackText('');
            }, 500);

            // Calculate cadence from step times
            if (stepTimesRef.current.length >= 2) {
                const times = stepTimesRef.current;
                const intervals = [];
                for (let i = 1; i < times.length; i++) {
                    intervals.push(times[i] - times[i - 1]);
                }
                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const calculatedCadence = Math.round(60000 / avgInterval);
                setCadence(calculatedCadence);
            }
        }
    }, [playSuccessSound]);

    // === Update Accuracy ===
    useEffect(() => {
        const total = perfectCount + goodCount + missCount;
        if (total > 0) {
            const acc = Math.round(((perfectCount * 1 + goodCount * 0.5) / total) * 100);
            setAccuracy(acc);
        }
    }, [perfectCount, goodCount, missCount]);

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
        // Resume audio context if suspended
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }

        setGameState(GAME_STATES.PLAYING);
        gameStateRef.current = GAME_STATES.PLAYING;
        setSessionTime(0);
        setScore(0);
        setStreak(0);
        setBeatCount(0);
        setPerfectCount(0);
        setGoodCount(0);
        setMissCount(0);
        setCadence(0);
        setAccuracy(100);
        stepTimesRef.current = [];

        startMetronome();
    };

    const pauseSession = () => {
        setGameState(GAME_STATES.PAUSED);
        gameStateRef.current = GAME_STATES.PAUSED;
        stopMetronome();
    };

    const resumeSession = () => {
        setGameState(GAME_STATES.PLAYING);
        gameStateRef.current = GAME_STATES.PLAYING;
        startMetronome();
    };

    const stopSession = () => {
        setGameState(GAME_STATES.COMPLETED);
        gameStateRef.current = GAME_STATES.COMPLETED;
        stopMetronome();
    };

    const resetSession = () => {
        setGameState(GAME_STATES.READY);
        gameStateRef.current = GAME_STATES.READY;
        setSessionTime(0);
        setScore(0);
        setStreak(0);
        setBeatCount(0);
        setPerfectCount(0);
        setGoodCount(0);
        setMissCount(0);
        setCadence(0);
        setAccuracy(100);
        setFeedbackState('waiting');
        setFeedbackText('');
        stepTimesRef.current = [];
    };

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
            case 'miss': return 'ring-gray-400 bg-gray-500/20';
            default: return 'ring-blue-400 bg-blue-500/20';
        }
    };

    const getRingGlow = () => {
        if (feedbackState === 'perfect') {
            return 'shadow-[0_0_50px_rgba(16,185,129,0.5)]';
        }
        if (isPulsing) {
            return 'shadow-[0_0_30px_rgba(59,130,246,0.4)]';
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
                                <span>80</span>
                                <span>120 (Fast)</span>
                            </div>
                        </div>

                        {/* Preset Buttons */}
                        <div className="grid grid-cols-3 gap-2">
                            {[50, 60, 80].map(preset => (
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
                                                feedbackState === 'miss' ? 'text-red-500' : 'opacity-0'
                                            }`}>
                                            {feedbackState === 'waiting' ? (
                                                <span className="text-[10px] text-blue-300 font-bold animate-pulse">READY</span>
                                            ) :
                                                feedbackState === 'perfect' ? 'Perfect!' :
                                                    feedbackState === 'good' ? 'Good' : 'Miss'}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>


                    </div>
                </div>

                {/* RIGHT: Dashboard (Stats & Controls) */}
                <div className="lg:col-span-4 flex flex-col gap-6 w-full">

                    {/* Timer & Accuracy (Desktop) */}
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
                    <div className="grid grid-cols-2 gap-4">
                        {/* Score Card */}
                        <div className="bg-white rounded-3xl shadow-lg p-6 lg:p-8 flex flex-col items-center justify-center text-center">
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-2">Score</div>
                            <div className="text-4xl lg:text-5xl font-black text-blue-600 tabular-nums">
                                {score}
                            </div>
                        </div>

                        {/* Accuracy Card */}
                        <div className="bg-white rounded-3xl shadow-lg p-6 lg:p-8 flex flex-col items-center justify-center text-center">
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-2">Accuracy</div>
                            <div className={`text-4xl lg:text-5xl font-black tabular-nums ${accuracy > 80 ? 'text-emerald-500' : accuracy > 50 ? 'text-amber-500' : 'text-red-500'
                                }`}>
                                {accuracy}%
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

                    {/* Completion Message */}
                    {gameState === GAME_STATES.COMPLETED && (
                        <div className="mt-2 bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-4 text-center">
                            <h3 className="text-xl font-bold text-emerald-800">Session Complete!</h3>
                            <p className="text-emerald-600">Great rhythm consistency.</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default GameRhythm;
