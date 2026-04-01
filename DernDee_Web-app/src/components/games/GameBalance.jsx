import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Target, Play, Pause, Square, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import derndeeLogo from '../../assets/images/derndee-logo.png';

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

const GameBalance = () => {
    const navigate = useNavigate();

    // === Game State ===
    const [gameState, setGameState] = useState(GAME_STATES.READY);
    const [showSettings, setShowSettings] = useState(false);
    const [sensitivity, setSensitivity] = useState(3.0); // For display
    const gameStateRef = useRef(GAME_STATES.READY);

    // === Calibration Offsets (use refs so callback always gets latest) ===
    const offsetRollRef = useRef(0);
    const offsetPitchRef = useRef(0);
    const [offsetRoll, setOffsetRoll] = useState(0); // For display only
    const [offsetPitch, setOffsetPitch] = useState(0); // For display only
    const [isCalibrating, setIsCalibrating] = useState(false);
    const isCalibratingRef = useRef(false); // Ref for callback
    const calibrationSamplesRef = useRef([]);
    const sensitivityRef = useRef(3.0);

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

    // === WebSocket ===
    const wsRef = useRef(null);
    const timerRef = useRef(null);
    const zoneTimerRef = useRef(null);

    // === Computed Values ===
    const distanceFromCenter = Math.sqrt(bubbleX * bubbleX + bubbleY * bubbleY);

    const getZone = () => {
        if (distanceFromCenter <= ZONE_A_THRESHOLD) return 'A'; // Perfect
        if (distanceFromCenter <= ZONE_B_THRESHOLD) return 'B'; // Warning
        return 'C'; // Critical
    };

    const zone = getZone();

    // === Auto-Calibration State ===
    const hasAutoCalibratedRef = useRef(false);

    // === WebSocket Connection ===
    useEffect(() => {
        const connectWebSocket = () => {
            try {
                wsRef.current = new WebSocket(`ws://${window.location.hostname}:8765`);

                wsRef.current.onopen = () => {
                    console.log('🎯 Balance Game connected to WebSocket');
                    // Reset auto-calibration flag on new connection to ensure we get a good zero
                    hasAutoCalibratedRef.current = false;
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

    // === Handle Sensor Data ===
    const handleSensorData = useCallback((msg) => {
        if (msg.type !== 'DATA') return;

        const payload = msg.payload;

        // Extract Roll and Pitch from quaternion
        if (payload.quaternion && Array.isArray(payload.quaternion)) {
            const [w, x, y, z] = payload.quaternion;

            // Convert quaternion to Euler angles
            // Roll (X-axis rotation) - Inversion/Eversion
            const sinr_cosp = 2.0 * (w * x + y * z);
            const cosr_cosp = 1.0 - 2.0 * (x * x + y * y);
            const roll = Math.atan2(sinr_cosp, cosr_cosp) * (180 / Math.PI);

            // Pitch (Y-axis rotation) - Dorsiflexion/Plantarflexion
            const sinp = 2.0 * (w * y - z * x);
            const pitch = Math.abs(sinp) >= 1
                ? Math.sign(sinp) * 90
                : Math.asin(sinp) * (180 / Math.PI);

            setRawRoll(roll);
            setRawPitch(pitch);

            // === AUTO-CALIBRATION ON ENTRY (SILENT) ===
            // Since user just finished mandatory calibration, we snap the current posture 
            // as the center point instantly without showing the loading spinner again.
            if (!hasAutoCalibratedRef.current && !isCalibratingRef.current) {
                console.log("🚀 Silent Auto-Tare applied");

                // Instant Snap
                offsetRollRef.current = roll;
                offsetPitchRef.current = pitch;
                setOffsetRoll(roll);
                setOffsetPitch(pitch);

                hasAutoCalibratedRef.current = true;
            }

            // Collect samples during calibration (USE REF!)
            if (isCalibratingRef.current) {
                calibrationSamplesRef.current.push({ roll, pitch });
            }

            // Apply calibration offset and sensitivity (READ FROM REFS!)
            const targetRoll = (roll - offsetRollRef.current) * sensitivityRef.current;
            const targetPitch = (pitch - offsetPitchRef.current) * sensitivityRef.current;

            // Apply Smoothing (LERP) - Factor 0.1 for very smooth visualization
            const smoothFactor = 0.1;
            const smoothedRoll = lastSmoothedRollRef.current + (targetRoll - lastSmoothedRollRef.current) * smoothFactor;
            const smoothedPitch = lastSmoothedPitchRef.current + (targetPitch - lastSmoothedPitchRef.current) * smoothFactor;

            // Update refs
            lastSmoothedRollRef.current = smoothedRoll;
            lastSmoothedPitchRef.current = smoothedPitch;

            setCalibratedRoll(smoothedRoll);
            setCalibratedPitch(smoothedPitch);

            // Throttled Display Update (Every 700ms)
            const now = Date.now();
            if (now - lastDisplayUpdateRef.current > 700) {
                setDisplayRoll(smoothedRoll);
                setDisplayPitch(smoothedPitch);
                lastDisplayUpdateRef.current = now;
            }

            // Clamp to -100 to 100 range (map ±30° to ±100%)
            const maxAngle = 30;
            const newX = Math.max(-100, Math.min(100, (smoothedRoll / maxAngle) * 100));
            const newY = Math.max(-100, Math.min(100, (-smoothedPitch / maxAngle) * 100)); // Invert Y

            setBubbleX(newX);
            setBubbleY(newY);

            // Track deviation for average calculation
            if (gameStateRef.current === GAME_STATES.PLAYING) {
                const deviation = Math.sqrt(calibratedRoll ** 2 + calibratedPitch ** 2);
                deviationHistoryRef.current.push(deviation);

                // Keep last 100 samples for rolling average
                if (deviationHistoryRef.current.length > 100) {
                    deviationHistoryRef.current.shift();
                }

                // Update average deviation
                const avg = deviationHistoryRef.current.reduce((a, b) => a + b, 0) / deviationHistoryRef.current.length;
                setAvgDeviation(avg);
            }
        }
    }, []); // No deps needed since everything uses refs

    // === Calibration ===
    // === Calibration Logic ===
    const finishCalibration = useCallback(() => {
        const samples = calibrationSamplesRef.current;
        if (samples.length > 0) {
            const avgRoll = samples.reduce((a, b) => a + b.roll, 0) / samples.length;
            const avgPitch = samples.reduce((a, b) => a + b.pitch, 0) / samples.length;

            // Set both ref AND state
            offsetRollRef.current = avgRoll;
            offsetPitchRef.current = avgPitch;
            setOffsetRoll(avgRoll);
            setOffsetPitch(avgPitch);

            console.log(`✅ Calibrated: Roll=${avgRoll.toFixed(1)}°, Pitch=${avgPitch.toFixed(1)}°`);
        }

        setIsCalibrating(false);
        isCalibratingRef.current = false; // Reset ref too!
        setGameState(GAME_STATES.READY);
        gameStateRef.current = GAME_STATES.READY;
    }, []);

    const startCalibration = () => {
        setIsCalibrating(true);
        isCalibratingRef.current = true; // Set ref too!
        calibrationSamplesRef.current = [];
        setGameState(GAME_STATES.CALIBRATING);
        gameStateRef.current = GAME_STATES.CALIBRATING;

        // Collect samples for 2 seconds
        setTimeout(() => {
            finishCalibration();
        }, 1500); // 1.5s for manual calibration
    };

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
        setGameState(GAME_STATES.PLAYING);
        gameStateRef.current = GAME_STATES.PLAYING;
        setTimeInZone(0);
        setZoneStats({ A: 0, B: 0, C: 0 });
        setSessionTime(0);
        setAvgDeviation(0);
        deviationHistoryRef.current = [];
    };

    const pauseSession = () => {
        setGameState(GAME_STATES.PAUSED);
        gameStateRef.current = GAME_STATES.PAUSED;
    };

    const resumeSession = () => {
        setGameState(GAME_STATES.PLAYING);
        gameStateRef.current = GAME_STATES.PLAYING;
    };

    const stopSession = () => {
        setGameState(GAME_STATES.COMPLETED);
        gameStateRef.current = GAME_STATES.COMPLETED;
    };

    const resetSession = () => {
        setGameState(GAME_STATES.READY);
        gameStateRef.current = GAME_STATES.READY;
        setTimeInZone(0);
        setZoneStats({ A: 0, B: 0, C: 0 });
        setSessionTime(0);
        setAvgDeviation(0);
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
                                left: `calc(50% + ${bubbleX * 1.2}px - ${window.innerWidth >= 1024 ? 32 : 20}px)`,
                                top: `calc(50% + ${bubbleY * 1.2}px - ${window.innerWidth >= 1024 ? 32 : 20}px)`,
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
                    </div>
                </div>
            </main>
        </div>
    );
};

export default GameBalance;

