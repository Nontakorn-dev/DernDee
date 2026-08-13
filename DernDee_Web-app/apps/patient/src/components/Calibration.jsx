import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';
import devicePositionImageSrc from '@shared/assets/images/devicePositionImage.png';
import { createRealtimeConnection } from '@shared/gateway/realtimeTransport.js';
import { isRealtimeShankSample, normalizeRealtimeSensorSample } from '@shared/gateway/realtimeSensorUtils.js';
import { estimateShankLengthM } from '@shared/gait/gaitCalibration.js';
import { createGaitCalibrationCaptureSession } from '@shared/gait/gaitCalibrationCapture.js';
import {
    readGaitCalibrationPrefs,
    writeGaitCalibrationPrefs,
} from '@shared/gait/gaitCalibrationStore.js';
import { GAIT_SENSOR_STALE_AFTER_MS } from '@shared/gait/gaitRuntimeConfig.js';

const Calibration = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const targetRoute = location.state?.target || '/walk-session';

    const [isConnected, setIsConnected] = useState(false);
    const [countdown, setCountdown] = useState(5);
    const [calibrationProgress, setCalibrationProgress] = useState(0);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [isCountdownActive, setIsCountdownActive] = useState(false);
    const [isCalibrationComplete, setIsCalibrationComplete] = useState(false);
    const [calibrationSummary, setCalibrationSummary] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [shankLengthCm, setShankLengthCm] = useState('');
    const [streamingShankCount, setStreamingShankCount] = useState(0);
    const [tPoseImage, setTPoseImage] = useState(devicePositionImageSrc);

    // Custom Modal State
    const [errorModal, setErrorModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'error', // 'error' | 'warning' | 'info'
        buttonText: 'OK'
    });

    const wsRef = useRef(null);
    const manualDisconnectRef = useRef(false);
    const reconnectTimeoutRef = useRef(null);
    const calibrationCaptureRef = useRef(null);
    const streamingSensorsRef = useRef(new Map());

    useEffect(() => {
        const prefs = readGaitCalibrationPrefs();
        if (Number.isFinite(prefs.heightCm)) {
            setHeightCm(String(prefs.heightCm));
        }
        if (Number.isFinite(prefs.shankLengthCm)) {
            setShankLengthCm(String(prefs.shankLengthCm));
        }
    }, []);

    useEffect(() => {
        calibrationCaptureRef.current = createGaitCalibrationCaptureSession({
            onProgress: (percent, message) => {
                setCalibrationProgress(Math.max(0, Math.min(3, (percent / 100) * 3)));
            },
            onComplete: (outcome) => {
                if (outcome.ok) {
                    setIsCalibrationComplete(true);
                    setIsCalibrating(false);
                    setCalibrationProgress(3);
                    setCalibrationSummary(outcome.summary || '');
                    return;
                }

                setIsCalibrating(false);
                setCalibrationProgress(0);
                setErrorModal({
                    isOpen: true,
                    title: 'Calibration Failed',
                    message: outcome.message || 'Please stand upright and remain still for 3 seconds.',
                    type: 'error',
                    buttonText: 'Try Again',
                });
            },
        });

        return () => {
            calibrationCaptureRef.current?.cancel?.();
        };
    }, []);

    const pruneStreamingSensors = (now = Date.now()) => {
        for (const [sensorKey, lastSeenAt] of streamingSensorsRef.current.entries()) {
            if (now - lastSeenAt > GAIT_SENSOR_STALE_AFTER_MS) {
                streamingSensorsRef.current.delete(sensorKey);
            }
        }
        setStreamingShankCount(streamingSensorsRef.current.size);
        return streamingSensorsRef.current.size;
    };

    useEffect(() => {
        const timer = window.setInterval(() => {
            pruneStreamingSensors();
        }, 1000);

        return () => window.clearInterval(timer);
    }, []);

    // === WebSocket Connection ===
    useEffect(() => {
        manualDisconnectRef.current = false;

        const connectWebSocket = () => {
            const ws = createRealtimeConnection();
            wsRef.current = ws;
            console.log("VERSION 2 ACTIVE - CUSTOM MODALS");

            ws.onopen = () => {
                console.log('✅ Connected to DernDee Backend for Calibration');
                setIsConnected(true);
            };

            ws.onclose = () => {
                console.log('❌ Disconnected from Backend');
                setIsConnected(false);

                if (manualDisconnectRef.current) {
                    return;
                }

                reconnectTimeoutRef.current = window.setTimeout(() => {
                    reconnectTimeoutRef.current = null;

                    if (manualDisconnectRef.current) {
                        return;
                    }

                    connectWebSocket();
                }, 2000);
            };

            ws.onerror = (error) => {
                console.error('WebSocket Error:', error);
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleMessage(msg);
                } catch (e) {
                    // Ignore parsing errors for non-JSON messages if any
                }
            };
        };

        connectWebSocket();

        return () => {
            manualDisconnectRef.current = true;
            if (reconnectTimeoutRef.current) {
                window.clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    // === Handle Backend Messages ===
    const handleMessage = (msg) => {
        if (msg.type === 'DATA') {
            const sample = normalizeRealtimeSensorSample(msg.payload || {});
            if (sample && isRealtimeShankSample(sample)) {
                streamingSensorsRef.current.set(sample.sensorKey, Date.now());
                pruneStreamingSensors();
                calibrationCaptureRef.current?.ingestSample(sample);
            }
            return;
        }

        if (msg.type === 'CALIBRATION_FAILED') {
            console.error('Calibration Failed');
            setIsCalibrating(false);
            setCalibrationProgress(0);
            setErrorModal({
                isOpen: true,
                title: 'Calibration Failed',
                message: 'Please stand upright in a T-Pose and remain still for 3 seconds.',
                type: 'error',
                buttonText: 'Try Again'
            });
        }
    };

    // Start countdown when component mounts and mostly connected
    // REMOVED: Auto-start countdown (User requested manual start)
    // useEffect(() => {
    //     if (isConnected && !isCountdownActive && !isCalibrationComplete && !isCalibrating) {
    //          setIsCountdownActive(true);
    //          setCountdown(5);
    //     }
    // }, [isConnected]);

    // Handle abrupt disconnection during calibration
    useEffect(() => {
        if (!isConnected && (isCalibrating || isCountdownActive)) {
            calibrationCaptureRef.current?.cancel?.();
            setIsCalibrating(false);
            setIsCountdownActive(false);
            setCountdown(5);
            setErrorModal({
                isOpen: true,
                title: 'Device Disconnected',
                message: 'Connection lost. Please check your device and reconnect.',
                type: 'error',
                buttonText: 'OK'
            });
        }
    }, [isConnected, isCalibrating, isCountdownActive]);

    // Countdown timer: 5 -> 0
    useEffect(() => {
        if (isCountdownActive && countdown > 0) {
            const interval = setInterval(() => {
                setCountdown(prev => {
                    const next = prev - 1;
                    if (next <= 0) {
                        // Countdown finished, Start Calibration
                        startCalibrationProcess();
                        return 0;
                    }
                    return next;
                });
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [isCountdownActive, countdown]);

    const handleManualStartCalibration = () => {
        if (isConnected) {
            setIsCountdownActive(true);
            setCountdown(5);
        } else {
            setErrorModal({
                isOpen: true,
                title: 'Not Connected',
                message: 'Please ensure your device is turned on and connected.',
                type: 'warning',
                buttonText: 'OK'
            });
        }
    };

    const startCalibrationProcess = () => {
        setIsCountdownActive(false);
        setIsCalibrating(true);
        setCalibrationProgress(0);
        setCalibrationSummary('');
        setIsCalibrationComplete(false);

        if (!pruneStreamingSensors()) {
            setIsCalibrating(false);
            setErrorModal({
                isOpen: true,
                title: 'No Shank Sensor',
                message: 'Connect a shank sensor and wait for live data before calibrating.',
                type: 'warning',
                buttonText: 'OK'
            });
            return;
        }

        const parsedHeightCm = Number.parseFloat(heightCm);
        const parsedShankLengthCm = Number.parseFloat(shankLengthCm);
        writeGaitCalibrationPrefs({
            heightCm: Number.isFinite(parsedHeightCm) ? parsedHeightCm : null,
            shankLengthCm: Number.isFinite(parsedShankLengthCm) ? parsedShankLengthCm : null,
        });

        const shankLengthM = estimateShankLengthM({
            heightCm: Number.isFinite(parsedHeightCm) ? parsedHeightCm : null,
            shankLengthCm: Number.isFinite(parsedShankLengthCm) ? parsedShankLengthCm : null,
        });

        calibrationCaptureRef.current?.start({
            shankLengthM,
        });
    };


    const handleDisconnect = () => {
        manualDisconnectRef.current = true;
        calibrationCaptureRef.current?.cancel?.();
        if (reconnectTimeoutRef.current) {
            window.clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (wsRef.current) {
            wsRef.current.close();
        }
        setIsConnected(false);
        setIsCalibrating(false);
        setIsCountdownActive(false);
        setIsCalibrationComplete(false);
        setCalibrationProgress(0);
        setCalibrationSummary('');
        setCountdown(5);
    };

    const handleStartRecording = () => {
        if (isConnected && isCalibrationComplete) {
            // Navigate to the target route selected in TherapySelect
            navigate(targetRoute);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Countdown Overlay - Full Screen with Blur Background */}
            {isCountdownActive && countdown > 0 && (
                <div className="fixed inset-0 bg-gradient-to-br from-blue-900/40 via-indigo-900/40 to-purple-900/40 backdrop-blur-lg z-50 flex items-center justify-center">
                    <div className="flex flex-col items-center justify-center relative">
                        {/* Pulsing Circle Background */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 lg:w-[28rem] lg:h-[28rem] rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-600/20 animate-ping"></div>
                            <div className="absolute w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 lg:w-[28rem] lg:h-[28rem] rounded-full bg-gradient-to-br from-blue-400/30 to-indigo-500/30 animate-pulse"></div>
                        </div>

                        {/* Countdown Number */}
                        <div className="relative z-10">
                            <div
                                className={`text-9xl sm:text-[12rem] md:text-[15rem] lg:text-[18rem] font-black text-white mb-6 sm:mb-8 transition-all duration-300 font-sans ${countdown === 5 ? 'countdown-scale-in' : countdown <= 1 ? 'countdown-scale-out' : ''
                                    }`}
                                style={{
                                    textShadow: '0 0 60px rgba(59, 130, 246, 1), 0 0 100px rgba(59, 130, 246, 0.9), 0 0 140px rgba(59, 130, 246, 0.7), 0 0 180px rgba(59, 130, 246, 0.5), 0 8px 32px rgba(0, 0, 0, 0.9), 0 0 0 8px rgba(59, 130, 246, 0.3)',
                                    filter: 'drop-shadow(0 0 40px rgba(59, 130, 246, 1))',
                                }}
                            >
                                {countdown}
                            </div>
                        </div>

                        {/* Instruction Text */}
                        <div className="relative z-10 mt-4 sm:mt-6">
                            <p className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-white font-extrabold tracking-wide drop-shadow-2xl text-center px-4">
                                Get Ready
                            </p>
                            <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-blue-100 font-semibold mt-3 sm:mt-4 text-center px-4 drop-shadow-lg">
                                Calibration starting in {countdown} second{countdown !== 1 ? 's' : ''}
                            </p>
                        </div>

                        {/* Progress Indicator */}
                        <div className="relative z-10 mt-8 sm:mt-10 md:mt-12 w-64 sm:w-80 md:w-96 lg:w-[28rem]">
                            <div className="w-full bg-white/20 rounded-full h-2 sm:h-3 overflow-hidden shadow-inner">
                                <div
                                    className="bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-1000 ease-linear shadow-lg"
                                    style={{ width: `${((6 - countdown) / 5) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/home')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <img src={derndeeLogo} alt="DernDee" className="h-8 sm:h-10 md:h-12 object-contain" />
                </div>
            </header>

            {/* Main Content */}
            <main className="p-3 sm:p-4 lg:p-6 pb-6 max-w-full mx-auto">
                {/* Mobile: Separate Cards */}
                <div className="block md:hidden bg-white rounded-3xl shadow-2xl p-4 sm:p-6 mb-3 sm:mb-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                        {/* <button
                            onClick={() => navigate('/therapy')}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                        </button> */}
                        <h1 className="text-lg sm:text-xl font-bold text-gray-800">
                            Calibration
                        </h1>
                    </div>
                </div>

                {/* Calibration Status Card - Mobile */}
                <div className={`block md:hidden rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 mb-3 sm:mb-4 transition-all duration-300 border-2 ${isConnected ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200' : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'}`}>
                    <div className="flex items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center animate-pulse shadow-lg ${isConnected ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'}`}>
                                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-white"></div>
                            </div>
                            <div className="flex flex-col">
                                <span className={`text-base sm:text-lg md:text-xl font-bold ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
                                    {isConnected ? 'Connected' : 'Disconnected'}
                                </span>
                            </div>
                        </div>
                        {isConnected && (
                            <button
                                onClick={handleDisconnect}
                                className="px-4 py-2 rounded-full text-xs font-semibold border-2 border-red-300 text-red-600 hover:bg-red-50"
                            >
                                Disconnect
                            </button>
                        )}
                    </div>

                    <p className="text-sm text-gray-600 mb-3">
                        Shank sensors streaming: {streamingShankCount}
                    </p>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <label className="text-sm text-gray-700">
                            Height (cm)
                            <input
                                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                                type="number"
                                min="120"
                                max="220"
                                step="1"
                                placeholder="170"
                                value={heightCm}
                                onChange={(event) => setHeightCm(event.target.value)}
                                disabled={isCalibrating}
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            Shank (cm)
                            <input
                                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                                type="number"
                                min="30"
                                max="60"
                                step="0.5"
                                placeholder="auto"
                                value={shankLengthCm}
                                onChange={(event) => setShankLengthCm(event.target.value)}
                                disabled={isCalibrating}
                            />
                        </label>
                    </div>

                    {/* Calibration Section */}
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-800">
                            Calibration
                        </h2>
                        <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0 ${isCalibrating ? 'bg-yellow-500 animate-pulse' : isCalibrationComplete ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    </div>

                    {/* Progress Bar */}
                    <div>
                        <div className="w-full bg-gray-200 rounded-full h-3 sm:h-4 overflow-hidden mb-2 shadow-inner">
                            <div
                                className={`h-full rounded-full transition-all duration-100 shadow-md ${isCalibrationComplete ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${(calibrationProgress / 3) * 100}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-end">
                            <span className="text-xs sm:text-sm md:text-base text-gray-700 font-medium">
                                {Math.floor(calibrationProgress)}s / 3s
                            </span>
                        </div>
                        {calibrationSummary && (
                            <p className="text-xs sm:text-sm text-green-700 font-medium mt-2">
                                {calibrationSummary}
                            </p>
                        )}
                    </div>
                </div>

                {/* Image Card - Mobile */}
                <div className="block md:hidden bg-white rounded-3xl shadow-2xl p-3 sm:p-4 md:p-6 mb-3 sm:mb-4">
                    <div className="w-full h-[240px] sm:h-[300px] md:h-[320px] rounded-2xl border border-blue-100 bg-white flex items-center justify-center overflow-hidden mb-3 sm:mb-4">
                        <img
                            src={tPoseImage}
                            alt="T-Pose Mannequin"
                            className="w-full h-full object-contain"
                            loading="lazy"
                        />
                    </div>
                    {/* Control Buttons (Mobile) */}
                    <div className="space-y-3">
                        {/* Start Calibration Button */}
                        {!isCalibrationComplete && !isCalibrating && (
                            <button
                                onClick={handleManualStartCalibration}
                                disabled={!isConnected}
                                className={`w-full py-3 sm:py-4 md:py-5 rounded-2xl text-sm sm:text-base md:text-lg font-bold transition-all duration-300 shadow-lg ${isConnected
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer hover:scale-105 transform'
                                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                START CALIBRATION
                            </button>
                        )}

                        {/* Start Session Button */}
                        <button
                            onClick={handleStartRecording}
                            disabled={!isConnected || !isCalibrationComplete}
                            className={`w-full py-3 sm:py-4 md:py-5 rounded-2xl text-sm sm:text-base md:text-lg font-bold transition-all duration-300 shadow-lg ${isConnected && isCalibrationComplete
                                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:scale-105 transform'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            START SESSION
                        </button>
                    </div>
                    {(!isConnected || !isCalibrationComplete) && (
                        <p className="text-red-500 text-xs sm:text-sm text-center mt-2">
                            {!isConnected
                                ? 'Please connect a shank sensor'
                                : streamingShankCount === 0
                                ? 'Wait for shank sensor data, then calibrate'
                                : !isCalibrationComplete ? 'Press START CALIBRATION when ready' : 'Ready to start'
                            }
                        </p>
                    )}
                </div>

                {/* Tablet Portrait: Two-Column Layout */}
                <div className="hidden md:flex lg:hidden min-h-[calc(100vh-8.5rem)] flex-col bg-white rounded-3xl shadow-2xl p-5 mb-4">
                    <div className="grid flex-1 min-h-0 grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-5 items-stretch">
                        <div className="min-w-0">
                            <div className="h-full min-h-[460px] rounded-2xl border border-blue-100 bg-white flex items-center justify-center overflow-hidden p-6">
                                <img
                                    src={tPoseImage}
                                    alt="T-Pose Mannequin"
                                    className="w-full h-full object-contain max-h-[700px]"
                                    loading="lazy"
                                />
                            </div>
                        </div>

                        <div className="min-w-0 h-full flex flex-col gap-4">
                            <div className={`rounded-3xl shadow-xl p-5 transition-all duration-300 border-2 ${isConnected ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200' : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'}`}>
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center animate-pulse shadow-lg ${isConnected ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'}`}>
                                            <div className="w-3 h-3 rounded-full bg-white"></div>
                                        </div>
                                        <span className={`text-xl font-bold ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
                                            {isConnected ? 'Connected' : 'Disconnected'}
                                        </span>
                                    </div>

                                    {isConnected && (
                                        <button
                                            onClick={handleDisconnect}
                                            className="px-4 py-2 rounded-full text-sm font-semibold border-2 border-red-300 text-red-600 hover:bg-red-50"
                                        >
                                            Disconnect
                                        </button>
                                    )}
                                </div>

                                <p className="text-sm text-gray-600 mb-3">
                                    Shank sensors streaming: {streamingShankCount}
                                </p>

                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <label className="text-sm text-gray-700">
                                        Height (cm)
                                        <input
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                                            type="number"
                                            min="120"
                                            max="220"
                                            step="1"
                                            placeholder="170"
                                            value={heightCm}
                                            onChange={(event) => setHeightCm(event.target.value)}
                                            disabled={isCalibrating}
                                        />
                                    </label>
                                    <label className="text-sm text-gray-700">
                                        Shank (cm)
                                        <input
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                                            type="number"
                                            min="30"
                                            max="60"
                                            step="0.5"
                                            placeholder="auto"
                                            value={shankLengthCm}
                                            onChange={(event) => setShankLengthCm(event.target.value)}
                                            disabled={isCalibrating}
                                        />
                                    </label>
                                </div>

                                <div className="flex items-center gap-3 mb-4">
                                    <h2 className="text-lg font-bold text-gray-800">
                                        Calibration
                                    </h2>
                                    <div className={`w-4 h-4 rounded-full flex-shrink-0 ${isCalibrating ? 'bg-yellow-500 animate-pulse' : isCalibrationComplete ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                </div>

                                <div>
                                    <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden mb-2 shadow-inner">
                                        <div
                                            className={`h-full rounded-full transition-all duration-100 shadow-md ${isCalibrationComplete ? 'bg-green-500' : 'bg-red-500'}`}
                                            style={{ width: `${(calibrationProgress / 3) * 100}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-end">
                                        <span className="text-sm text-gray-700 font-medium">
                                            {Math.floor(calibrationProgress)}s / 3s
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-3xl shadow-xl p-5">
                                <h3 className="text-lg font-bold text-gray-800 mb-3">
                                    Calibration Instructions
                                </h3>
                                <div className="space-y-2">
                                    <p className="text-sm md:text-base text-gray-700 leading-relaxed">
                                        Please follow these instructions <span className="font-semibold text-amber-700">strictly</span>:
                                    </p>
                                    <ol className="space-y-2 text-sm md:text-base text-gray-700 list-decimal list-inside ml-2">
                                        <li className="pl-2">
                                            <span className="font-semibold text-amber-700">Stand Upright</span>, Keep your body straight.
                                        </li>
                                        <li className="pl-2">
                                            <span className="font-semibold text-amber-700">T-Pose</span>, extend your arms to the sides parallel to the ground.
                                        </li>
                                        <li className="pl-2">
                                            <span className="font-semibold text-amber-700">Stay Still</span> during the calibration process.
                                        </li>
                                    </ol>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {!isCalibrationComplete && !isCalibrating && (
                                    <button
                                        onClick={handleManualStartCalibration}
                                        disabled={!isConnected}
                                        className={`w-full py-4 rounded-2xl text-base font-bold transition-all duration-300 shadow-lg ${isConnected
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer hover:scale-[1.02] transform'
                                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            }`}
                                    >
                                        START CALIBRATION
                                    </button>
                                )}

                                <button
                                    onClick={handleStartRecording}
                                    disabled={!isConnected || !isCalibrationComplete}
                                    className={`w-full py-4 rounded-2xl text-base font-bold transition-all duration-300 shadow-lg ${isConnected && isCalibrationComplete
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:scale-[1.02] transform'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        }`}
                                >
                                    START SESSION
                                </button>
                            </div>

                            {(!isConnected || !isCalibrationComplete) && (
                                <p className="text-red-500 text-sm text-center">
                                    {!isConnected
                                        ? 'Please connect a shank sensor'
                                        : streamingShankCount === 0
                                        ? 'Wait for shank sensor data, then calibrate'
                                        : !isCalibrationComplete ? 'Press START CALIBRATION when ready' : 'Ready to start'
                                    }
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Desktop/Tablet Landscape: Combined Card */}
                <div className="hidden lg:block bg-white rounded-3xl shadow-2xl p-4 md:p-6 lg:p-8 mb-3 sm:mb-4">
                    <div className="mb-5 md:mb-6 lg:mb-8 pb-4 md:pb-5 lg:pb-6 border-b border-gray-200">
                        <div className="flex items-center gap-3 sm:gap-4">
                            {/* <button
                                onClick={() => navigate('/therapy')}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                            >
                                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                            </button> */}
                            <h1 className="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-800">
                                Calibration
                            </h1>
                        </div>
                    </div>

                    <div className="flex flex-row gap-6 md:gap-8 lg:gap-10 items-stretch">
                        <div className="w-[42%] md:w-[40%] lg:w-[38%] flex-shrink-0">
                            <div className="w-full h-full max-h-[600px] md:max-h-[650px] lg:max-h-[700px] rounded-2xl border border-blue-100 bg-white flex items-center justify-center overflow-hidden p-4">
                                <img
                                    src={tPoseImage}
                                    alt="T-Pose Mannequin"
                                    className="w-full h-full object-contain"
                                    loading="lazy"
                                />
                            </div>
                        </div>

                        <div className="w-[58%] md:w-[60%] lg:w-[62%] flex flex-col justify-center gap-5 md:gap-6 lg:gap-8">
                            {/* Calibration Status Card - Desktop */}
                            <div className={`border-2 rounded-2xl sm:rounded-3xl shadow-xl p-5 md:p-6 lg:p-7 transition-all duration-300 ${isConnected ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200' : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'}`}>
                                <div className="flex items-center justify-between gap-4 mb-4 md:mb-5">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse shadow-lg ${isConnected ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'}`}>
                                            <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-white"></div>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`text-lg md:text-xl lg:text-2xl font-bold ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
                                                {isConnected ? 'Connected' : 'Disconnected'}
                                            </span>
                                        </div>
                                    </div>
                                    {isConnected && (
                                        <button
                                            onClick={handleDisconnect}
                                            className="px-5 md:px-6 py-2.5 md:py-3 rounded-full text-sm md:text-base lg:text-lg font-semibold border-2 border-red-300 text-red-600 hover:bg-red-50"
                                        >
                                            Disconnect
                                        </button>
                                    )}
                                </div>

                                <p className="text-sm md:text-base text-gray-600 mb-3">
                                    Shank sensors streaming: {streamingShankCount}
                                </p>

                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <label className="text-sm md:text-base text-gray-700">
                                        Height (cm)
                                        <input
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                                            type="number"
                                            min="120"
                                            max="220"
                                            step="1"
                                            placeholder="170"
                                            value={heightCm}
                                            onChange={(event) => setHeightCm(event.target.value)}
                                            disabled={isCalibrating}
                                        />
                                    </label>
                                    <label className="text-sm md:text-base text-gray-700">
                                        Shank (cm)
                                        <input
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                                            type="number"
                                            min="30"
                                            max="60"
                                            step="0.5"
                                            placeholder="auto"
                                            value={shankLengthCm}
                                            onChange={(event) => setShankLengthCm(event.target.value)}
                                            disabled={isCalibrating}
                                        />
                                    </label>
                                </div>

                                <div className="flex items-center gap-3 mb-4">
                                    <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-800">
                                        Calibration
                                    </h2>
                                    <div className={`w-4 h-4 md:w-5 md:h-5 rounded-full flex-shrink-0 ${isCalibrating ? 'bg-yellow-500 animate-pulse' : isCalibrationComplete ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                </div>

                                <div>
                                    <div className="w-full bg-gray-200 rounded-full h-4 md:h-5 overflow-hidden mb-2 shadow-inner">
                                        <div
                                            className={`h-full rounded-full transition-all duration-100 shadow-md ${isCalibrationComplete ? 'bg-green-500' : 'bg-red-500'}`}
                                            style={{ width: `${(calibrationProgress / 3) * 100}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-end">
                                        <span className="text-sm md:text-base lg:text-lg text-gray-700 font-medium">
                                            {Math.floor(calibrationProgress)}s / 3s
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl sm:rounded-3xl shadow-xl p-5 md:p-6 lg:p-7">
                                <h3 className="text-base md:text-lg lg:text-xl xl:text-2xl font-bold text-gray-800 mb-3 md:mb-4">
                                    Calibration Instructions
                                </h3>
                                <div className="space-y-2 md:space-y-3">
                                    <p className="text-sm md:text-base lg:text-lg text-gray-700 leading-relaxed">
                                        Please follow these instructions <span className="font-semibold text-amber-700">strictly</span>:
                                    </p>
                                    <ol className="space-y-2 md:space-y-2.5 text-sm md:text-base lg:text-lg text-gray-700 list-decimal list-inside ml-2">
                                        <li className="pl-2">
                                            <span className="font-semibold text-amber-700">Stand Upright</span>, Keep your body straight.
                                        </li>
                                        <li className="pl-2">
                                            <span className="font-semibold text-amber-700">T-Pose</span>, extend your arms to the sides parallel to the ground.
                                        </li>
                                        <li className="pl-2">
                                            <span className="font-semibold text-amber-700">Stay Still</span> during the calibration process (3s).
                                        </li>
                                    </ol>
                                </div>
                            </div>

                            {/* Control Buttons (Desktop) */}
                            <div className="space-y-4">
                                {/* Start Calibration Button */}
                                {!isCalibrationComplete && !isCalibrating && (
                                    <button
                                        onClick={handleManualStartCalibration}
                                        disabled={!isConnected}
                                        className={`w-full py-4 md:py-5 lg:py-6 xl:py-7 rounded-2xl text-base md:text-lg lg:text-xl xl:text-2xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl ${isConnected
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer hover:scale-105 transform'
                                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            }`}
                                    >
                                        START CALIBRATION
                                    </button>
                                )}

                                {/* Start Session Button */}
                                <button
                                    onClick={handleStartRecording}
                                    disabled={!isConnected || !isCalibrationComplete}
                                    className={`w-full py-4 md:py-5 lg:py-6 xl:py-7 rounded-2xl text-base md:text-lg lg:text-xl xl:text-2xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl ${isConnected && isCalibrationComplete
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:scale-105 transform'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        }`}
                                >
                                    START SESSION
                                </button>
                            </div>

                            {(!isConnected || !isCalibrationComplete) && (
                                <p className="text-red-500 text-sm md:text-base lg:text-lg text-center mt-2">
                                    {!isConnected
                                        ? 'Please connect a shank sensor'
                                        : streamingShankCount === 0
                                        ? 'Wait for shank sensor data, then calibrate'
                                        : !isCalibrationComplete ? 'Press START CALIBRATION when ready' : 'Ready to start'
                                    }
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </main>


            {/* Custom Error/Status Modal */}
            {
                errorModal.isOpen && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center transform transition-all scale-100 animate-in zoom-in-95 duration-200">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${errorModal.type === 'error' ? 'bg-red-100' : 'bg-amber-100'
                                }`}>
                                <AlertCircle className={`w-8 h-8 ${errorModal.type === 'error' ? 'text-red-600' : 'text-amber-600'
                                    }`} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">
                                {errorModal.title}
                            </h3>
                            <p className="text-gray-600 mb-6">
                                {errorModal.message}
                            </p>
                            <button
                                onClick={() => setErrorModal(prev => ({ ...prev, isOpen: false }))}
                                className={`w-full py-3 rounded-xl font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] ${errorModal.type === 'error'
                                    ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200'
                                    : 'bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200'
                                    }`}
                            >
                                {errorModal.buttonText}
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Calibration;

