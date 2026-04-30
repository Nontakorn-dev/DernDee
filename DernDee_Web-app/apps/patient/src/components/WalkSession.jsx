import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Footprints, Gauge, Wifi, WifiOff, Pause, Play, Square } from 'lucide-react';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

// Avatar Images (PNG)
import avatarGeneral from '@shared/assets/Avatar/General.png';
import avatarGood from '@shared/assets/Avatar/Good.png';
import avatarCircumduction from '@shared/assets/Avatar/circumduction.png';
import avatarClearance from '@shared/assets/Avatar/clearance.png';
import avatarShortStep from '@shared/assets/Avatar/short_step.png';
import avatarWelcome from '@shared/assets/Avatar/welcome.png';

// Pre-recorded Voice
import goodBoySound from '@shared/assets/Voice/GoodBoy.m4a';

const WS_URL = `ws://${window.location.hostname}:8765`;

// TTS Voice Messages for each avatar state
const AVATAR_VOICE_MESSAGES = {
    welcome: "Ready to walk!",
    good: "Great form! Keep it up.",
    clearance: "Watch your step! Lift your knees a bit higher.",
    circumduction: "Don't swing your leg. Try to pull your knee straight forward.",
    short_step: "Steps are too short. Try to take longer strides."
};

const WalkSession = () => {
    const navigate = useNavigate();
    const { user } = useUserAuth();
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [isActive, setIsActive] = useState(true);
    const targetTime = 300; // 5 minutes

    // Data from Backend
    const [steps, setSteps] = useState(0);
    const [walkingSpeed, setWalkingSpeed] = useState(0);
    const [isWalking, setIsWalking] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [sessionMetrics, setSessionMetrics] = useState({});

    // Gait Metrics (accumulated for summary)
    const [gaitMetrics, setGaitMetrics] = useState({
        strideLengths: [],      // All stride lengths collected
        clearances: [],         // All clearance values collected
        speeds: [],             // All speed values collected
        stepDurations: [],      // All step durations collected
    });

    // Avatar State: 'welcome' | 'general' | 'good' | 'clearance' | 'circumduction' | 'short_step'
    const [avatarState, setAvatarState] = useState('welcome');
    const [feedbackText, setFeedbackText] = useState('');
    const [feedbackType, setFeedbackType] = useState(null);
    const [hasStartedWalking, setHasStartedWalking] = useState(false);

    // Refs
    const wsRef = useRef(null);
    const audioRef = useRef(new Audio(goodBoySound));
    const talkingTimeoutRef = useRef(null);
    const idleTimerRef = useRef(null);
    const lastStepCountRef = useRef(0);
    const lastStepTimeRef = useRef(Date.now());
    const sessionStartedRef = useRef(false);
    const manualDisconnectRef = useRef(false);

    // === TTS Helper Function ===
    const speakWithTTS = (text, onEnd) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'th-TH';
        utterance.rate = 0.9;
        if (onEnd) {
            utterance.onend = onEnd;
        }
        window.speechSynthesis.speak(utterance);
    };

    const sendControlMessage = (type, payload = {}) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
            return;
        }

        wsRef.current.send(JSON.stringify({ type, payload }));
    };

    // === WebSocket Connection ===
    useEffect(() => {
        manualDisconnectRef.current = false;

        const connectWebSocket = () => {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('✅ Connected to DernDee Backend');
                setIsConnected(true);
            };

            ws.onclose = () => {
                console.log('❌ Disconnected from Backend');
                setIsConnected(false);

                if (manualDisconnectRef.current) {
                    return;
                }

                setTimeout(connectWebSocket, 2000);
            };

            ws.onerror = (error) => {
                console.error('WebSocket Error:', error);
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleMessage(msg);
                } catch (e) {
                    console.error('Parse Error:', e);
                }
            };
        };

        connectWebSocket();

        return () => {
            manualDisconnectRef.current = true;
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    useEffect(() => {
        if (!isConnected || !user?.uid || sessionStartedRef.current) {
            return;
        }

        sendControlMessage('START_SESSION', {
            patient_id: user.uid,
            session_type: 'free_walk',
        });
        sessionStartedRef.current = true;
    }, [isConnected, user?.uid]);

    // === Welcome Effect (Play TTS on first load, then transition to general) ===
    useEffect(() => {
        const timer = setTimeout(() => {
            speakWithTTS(AVATAR_VOICE_MESSAGES.welcome, () => {
                setAvatarState('general');
            });
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    // === Idle Detection (20 seconds without step count increase) ===
    useEffect(() => {
        // Start idle check timer
        if (!idleTimerRef.current) {
            idleTimerRef.current = setInterval(() => {
                const now = Date.now();
                const timeSinceLastStep = now - lastStepTimeRef.current;

                // If steps haven't increased for 20 seconds, show welcome
                if (timeSinceLastStep >= 20000 && avatarState !== 'welcome') {
                    setAvatarState('welcome');
                    setFeedbackText('');
                    speakWithTTS(AVATAR_VOICE_MESSAGES.welcome, () => {
                        setAvatarState('general');
                    });
                    // Reset the timer so it doesn't keep triggering
                    lastStepTimeRef.current = now;
                }
            }, 1000);
        }

        return () => {
            if (idleTimerRef.current) {
                clearInterval(idleTimerRef.current);
                idleTimerRef.current = null;
            }
        };
    }, [avatarState]);

    // === Message Handler ===
    const handleMessage = (msg) => {
        if (msg.type !== 'DATA') return;

        const payload = msg.payload;

        if (payload.session_metrics) {
            setSessionMetrics(payload.session_metrics);
        }

        // Update step count and reset idle timer when steps increase
        if (payload.total_steps !== undefined) {
            if (payload.total_steps > lastStepCountRef.current) {
                // Steps increased - reset idle timer
                lastStepTimeRef.current = Date.now();
                lastStepCountRef.current = payload.total_steps;
            }
            setSteps(payload.total_steps);
        }

        // Update walking status
        if (payload.is_walking !== undefined) {
            setIsWalking(payload.is_walking);
            if (payload.is_walking && !hasStartedWalking) {
                setHasStartedWalking(true);
            }
        }

        // Update speed from gait_metrics
        if (Number.isFinite(payload.gait_metrics?.speed_mps)) {
            setWalkingSpeed(payload.gait_metrics.speed_mps);
        }

        // Collect gait metrics for summary (when step detected)
        if (payload.gait_metrics && payload.gait_metrics.stride_length_m) {
            setGaitMetrics(prev => ({
                strideLengths: [...prev.strideLengths, payload.gait_metrics.stride_length_m],
                clearances: [...prev.clearances, payload.gait_metrics.clearance_m],
                speeds: Number.isFinite(payload.gait_metrics.speed_mps)
                    ? [...prev.speeds, payload.gait_metrics.speed_mps]
                    : prev.speeds,
                stepDurations: Number.isFinite(payload.gait_metrics.step_duration_s)
                    ? [...prev.stepDurations, payload.gait_metrics.step_duration_s]
                    : prev.stepDurations,
            }));
        }

        // Handle Feedback
        if (payload.feedback) {
            handleFeedback(payload.feedback);
        } else {
            // No feedback - show general avatar when walking, keep current when idle
            if (!talkingTimeoutRef.current && payload.is_walking) {
                setAvatarState('general');
                setFeedbackText('');
            }
        }
    };

    // === Feedback Handler (Avatar + TTS) ===
    const handleFeedback = (feedback) => {
        // Update display text
        setFeedbackText(feedback.text || '');
        setFeedbackType(feedback.type || null);

        // Map feedback type to avatar state
        const avatarMap = {
            'clearance': 'clearance',
            'circumduction': 'circumduction',
            'short_step': 'short_step',
            'praise': 'good'
        };

        const newAvatarState = avatarMap[feedback.type] || 'general';
        setAvatarState(newAvatarState);

        // Get TTS message (use AVATAR_VOICE_MESSAGES or fallback to feedback.voice_text)
        const ttsMessage = AVATAR_VOICE_MESSAGES[newAvatarState] || feedback.voice_text;

        if (feedback.should_speak && ttsMessage) {
            // Use TTS for all feedback, then transition to general
            speakWithTTS(ttsMessage, () => {
                setAvatarState('general');
                setFeedbackText('');
                setFeedbackType(null);
            });

            // Fallback timeout in case onend doesn't fire
            if (talkingTimeoutRef.current) {
                clearTimeout(talkingTimeoutRef.current);
            }
            talkingTimeoutRef.current = setTimeout(() => {
                setAvatarState('general');
                setFeedbackText('');
                talkingTimeoutRef.current = null;
            }, 6000);
        }
    };

    // === Get Avatar Image ===
    const getAvatarImage = () => {
        switch (avatarState) {
            case 'welcome':
                return avatarWelcome;
            case 'good':
                return avatarGood;
            case 'clearance':
                return avatarClearance;
            case 'circumduction':
                return avatarCircumduction;
            case 'short_step':
                return avatarShortStep;
            case 'general':
            default:
                return avatarGeneral;
        }
    };

    // === Timer ===
    useEffect(() => {
        let interval = null;
        if (isActive) {
            interval = setInterval(() => {
                setTimeElapsed(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isActive]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const handleEndWalk = () => {
        setIsActive(false);

        // === Compute Summary Statistics ===
        const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        // Average step length = stride_length / 2 (stride = 2 steps)
        const avgStrideLength = avg(gaitMetrics.strideLengths);
        const avgStepLength = avgStrideLength / 2;
        const avgClearance = avg(gaitMetrics.clearances);
        const avgSpeed = avg(gaitMetrics.speeds);
        const avgStepDuration = avg(gaitMetrics.stepDurations);

        const cadence = Number.isFinite(sessionMetrics?.cadence_spm)
            ? sessionMetrics.cadence_spm
            : (avgStepDuration > 0 ? (60 / avgStepDuration) : 0);

        const summaryStrideLength = Number.isFinite(sessionMetrics?.avg_stride_length_m)
            ? sessionMetrics.avg_stride_length_m
            : avgStrideLength;
        const summaryStepLength = summaryStrideLength / 2;
        const summaryClearance = Number.isFinite(sessionMetrics?.avg_clearance_m)
            ? sessionMetrics.avg_clearance_m
            : avgClearance;
        const summarySpeed = Number.isFinite(sessionMetrics?.avg_speed_mps)
            ? sessionMetrics.avg_speed_mps
            : avgSpeed;
        const summarySteps = Number.isFinite(sessionMetrics?.total_steps)
            ? sessionMetrics.total_steps
            : steps;

        // Walking time in minutes
        const walkingTimeMinutes = timeElapsed / 60;

        sendControlMessage('END_SESSION', {
            summary: {
                total_steps: summarySteps,
                avg_speed_mps: summarySpeed,
                cadence_spm: cadence,
                avg_step_length_m: summaryStepLength,
                avg_stride_length_m: summaryStrideLength,
                avg_clearance_m: summaryClearance,
            },
        });

        sessionStartedRef.current = false;
        manualDisconnectRef.current = true;
        if (wsRef.current) {
            wsRef.current.close();
        }

        navigate('/walk-summary', {
            state: {
                duration: formatTime(timeElapsed),
                steps: summarySteps,
                walkingSpeed: summarySpeed,
                cadence: Math.round(cadence),
                stepLength: summaryStepLength,
                strideLength: summaryStrideLength,
                clearance: summaryClearance,
                // Summary stats for future use
                totalSteps: summarySteps,
                walkingTimeMinutes: walkingTimeMinutes,
            }
        });
    };

    const handlePauseWalk = () => {
        setIsActive(false);
    };

    const handleResumeWalk = () => {
        setIsActive(true);
    };

    // Check if 5 minutes reached
    const isTimeReached = timeElapsed >= targetTime;

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header */}
            {/* Header */}
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/therapy')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <img src={derndeeLogo} alt="DernDee" className="h-8 sm:h-10 md:h-12 object-contain" />
                </div>
                {/* Connection Status */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isConnected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                    }`}>
                    {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
                    {isConnected ? 'Connected' : 'Disconnected'}
                </div>
            </header>

            {/* Main Content */}
            <main className="p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8 pb-6 sm:pb-8 md:pb-10 max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl mx-auto">
                {/* Mobile Layout */}
                <div className="lg:hidden">
                    {/* Timer Card */}

                    <div className="text-center mb-4 sm:mb-5 md:mb-6">
                        {/* <h1 className="text-base sm:text-lg md:text-xl font-bold text-gray-800 mb-3 sm:mb-4 md:mb-5">
                                Walking Duration
                            </h1> */}
                        <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-4 sm:mb-5 md:mb-6">
                            {formatTime(timeElapsed)}
                        </div>
                        <div className="w-full max-w-xs sm:max-w-sm md:max-w-md mx-auto">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 sm:h-3 md:h-3.5 overflow-hidden mb-2 sm:mb-3 shadow-inner">
                                <div
                                    className="bg-blue-600 h-full rounded-full transition-all duration-300 shadow-md"
                                    style={{ width: `${Math.min((timeElapsed / targetTime) * 100, 100)}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs sm:text-sm md:text-base text-gray-600 font-medium">0:00</span>
                                <span className="text-xs sm:text-sm md:text-base text-gray-700 font-medium">{formatTime(targetTime)}</span>
                            </div>
                        </div>
                    </div>


                    {/* Avatar Card with Speech Bubble */}
                    <div className="bg-gradient-to-br from-blue-200 via-blue-300 to-blue-400 rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-4 md:p-5 mb-3 sm:mb-4 md:mb-5 relative">
                        {/* Speech Bubble */}
                        {feedbackText && (
                            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white rounded-xl px-4 py-2 shadow-lg z-10 max-w-[80%] text-center">
                                <p className="text-sm sm:text-base font-medium text-gray-800">{feedbackText}</p>
                                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                                    <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-white"></div>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-center h-full">
                            <img
                                src={getAvatarImage()}
                                alt="Avatar"
                                className="w-full h-full object-cover rounded-xl"
                            />
                        </div>
                    </div>

                    {/* Data Cards */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 mb-3 sm:mb-4 md:mb-5">
                        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-4 md:p-5">
                            <div className="flex flex-col items-center">
                                <h3 className="text-xs sm:text-sm md:text-base font-semibold text-gray-700 mb-2 sm:mb-3 md:mb-4">
                                    Step of walk
                                </h3>
                                <div className="mb-2 sm:mb-3 md:mb-4">
                                    <Footprints className="w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 text-blue-600" />
                                </div>
                                <div className="flex items-baseline gap-1 sm:gap-2">
                                    <span className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
                                        {steps}
                                    </span>
                                    <span className="text-xs sm:text-sm md:text-base text-gray-600 font-medium">
                                        step
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-4 md:p-5">
                            <div className="flex flex-col items-center">
                                <h3 className="text-xs sm:text-sm md:text-base font-semibold text-gray-700 mb-2 sm:mb-3 md:mb-4">
                                    Walking Speed
                                </h3>
                                <div className="mb-2 sm:mb-3 md:mb-4">
                                    <Gauge className="w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 text-amber-600" />
                                </div>
                                <div className="flex items-baseline gap-1 sm:gap-2">
                                    <span className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
                                        {walkingSpeed.toFixed(1)}
                                    </span>
                                    <span className="text-xs sm:text-sm md:text-base text-gray-600 font-medium">
                                        m/s
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Control Buttons */}
                    <div className="mt-3 sm:mt-4 md:mt-5">
                        {isTimeReached ? (
                            <button
                                onClick={handleEndWalk}
                                className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                <Square className="w-5 h-5" />
                                <span>End Session</span>
                            </button>
                        ) : (
                            <div className="flex gap-4">
                                {isActive ? (
                                    <button
                                        onClick={handlePauseWalk}
                                        className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                                    >
                                        <Pause className="w-6 h-6" />
                                        <span>Pause</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleResumeWalk}
                                        className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                                    >
                                        <Play className="w-6 h-6" />
                                        <span>Resume</span>
                                    </button>
                                )}
                                <button
                                    onClick={handleEndWalk}
                                    className="flex-1 py-4 bg-red-500 hover:bg-red-600 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                                >
                                    <Square className="w-5 h-5" />
                                    <span>Finish</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden lg:flex lg:flex-row lg:gap-6 xl:gap-8 items-stretch">
                    {/* Left: Avatar */}
                    <div className="w-[45%] xl:w-[42%] flex-shrink-0">
                        <div className="bg-gradient-to-br from-blue-200 via-blue-300 to-blue-400 rounded-2xl sm:rounded-3xl shadow-2xl p-4 md:p-5 lg:p-6 xl:p-8 h-full relative">
                            {/* Speech Bubble */}
                            {feedbackText && (
                                <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-white rounded-xl px-6 py-3 shadow-lg z-10 max-w-[80%] text-center">
                                    <p className="text-base lg:text-lg font-medium text-gray-800">{feedbackText}</p>
                                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                                        <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-white"></div>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center justify-center h-full">
                                <img
                                    src={getAvatarImage()}
                                    alt="Avatar"
                                    className="w-full h-full object-cover rounded-xl"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right: Data */}
                    <div className="flex-1 flex flex-col gap-4 lg:gap-5 xl:gap-6">
                        {/* Timer Card */}
                        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-4 md:p-5 lg:p-6 xl:p-7">
                            <div className="text-center">
                                <h1 className="text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-gray-800 mb-3 md:mb-4">
                                    Walking Duration
                                </h1>
                                <div className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold text-gray-900 mb-3 md:mb-4">
                                    {formatTime(timeElapsed)}
                                </div>
                                <div className="w-full max-w-md lg:max-w-lg xl:max-w-xl mx-auto">
                                    <div className="w-full bg-gray-200 rounded-full h-3 md:h-3.5 lg:h-4 overflow-hidden mb-2 shadow-inner">
                                        <div
                                            className="bg-blue-600 h-full rounded-full transition-all duration-300 shadow-md"
                                            style={{ width: `${Math.min((timeElapsed / targetTime) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm md:text-base lg:text-lg text-gray-600 font-medium">0:00</span>
                                        <span className="text-sm md:text-base lg:text-lg text-gray-700 font-medium">{formatTime(targetTime)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Data Cards */}
                        <div className="grid grid-cols-2 gap-4 lg:gap-5 xl:gap-6">
                            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-4 md:p-5 lg:p-6 xl:p-7">
                                <div className="flex flex-col items-center">
                                    <h3 className="text-sm md:text-base lg:text-lg xl:text-xl font-semibold text-gray-700 mb-3 md:mb-4">
                                        Step of walk
                                    </h3>
                                    <div className="mb-3 md:mb-4">
                                        <Footprints className="w-12 md:w-14 lg:w-16 xl:w-18 text-blue-600" />
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900">
                                            {steps}
                                        </span>
                                        <span className="text-sm md:text-base lg:text-lg xl:text-xl text-gray-600 font-medium">
                                            step
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-4 md:p-5 lg:p-6 xl:p-7">
                                <div className="flex flex-col items-center">
                                    <h3 className="text-sm md:text-base lg:text-lg xl:text-xl font-semibold text-gray-700 mb-3 md:mb-4">
                                        Walking Speed
                                    </h3>
                                    <div className="mb-3 md:mb-4">
                                        <Gauge className="w-12 md:w-14 lg:w-16 xl:w-18 text-amber-600" />
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900">
                                            {walkingSpeed.toFixed(1)}
                                        </span>
                                        <span className="text-sm md:text-base lg:text-lg xl:text-xl text-gray-600 font-medium">
                                            m/s
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Control Buttons */}
                        <div className="mt-auto">
                            {isTimeReached ? (
                                <button
                                    onClick={handleEndWalk}
                                    className="w-full py-4 md:py-5 lg:py-6 xl:py-7 rounded-2xl text-base md:text-lg lg:text-xl xl:text-2xl font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                                >
                                    <Square className="w-6 h-6 md:w-7 md:h-7" />
                                    <span>End Session</span>
                                </button>
                            ) : (
                                <div className="flex gap-4">
                                    {isActive ? (
                                        <button
                                            onClick={handlePauseWalk}
                                            className="flex-1 py-4 md:py-5 lg:py-6 xl:py-7 rounded-2xl text-base md:text-lg lg:text-xl xl:text-2xl font-bold bg-amber-500 hover:bg-amber-600 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                                        >
                                            <Pause className="w-6 h-6 md:w-7 md:h-7" />
                                            <span>Pause</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleResumeWalk}
                                            className="flex-1 py-4 md:py-5 lg:py-6 xl:py-7 rounded-2xl text-base md:text-lg lg:text-xl xl:text-2xl font-bold bg-green-500 hover:bg-green-600 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                                        >
                                            <Play className="w-6 h-6 md:w-7 md:h-7" />
                                            <span>Resume</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={handleEndWalk}
                                        className="flex-1 py-4 md:py-5 lg:py-6 xl:py-7 rounded-2xl text-base md:text-lg lg:text-xl xl:text-2xl font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                                    >
                                        <Square className="w-6 h-6 md:w-7 md:h-7" />
                                        <span>Finish</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default WalkSession;
