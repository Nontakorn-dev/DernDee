import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    ArrowRight,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Search,
    Battery,
    Radio,
    Wifi,
    WifiOff,
    AlertCircle,
    Loader2,
    Heart,
    Footprints,
    Activity,
    Bluetooth,
} from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';
import {
    BODY_POSITIONS,
    TRANSPORT_MODE_WEB_BLUETOOTH,
    autoConnectBrowserBleDevices,
    connectAllBrowserBleDevices,
    connectBrowserBleDevice,
    disconnectBrowserBleDevice,
    getBrowserBleDevicesSnapshot,
    getRealtimeTransportMode,
    isWebBluetoothSupported,
    resetBrowserBleDevices,
    subscribeToBrowserBleDevices,
    subscribeToRealtimeTransportMode,
} from '@shared/gateway/realtimeTransport.js';

const createInitialDevices = () => BODY_POSITIONS.map((position) => ({
    positionId: position.id,
    positionName: position.name,
    order: position.order,
    expectedDeviceId: position.deviceId,
    deviceId: null,
    deviceName: null,
    status: 'disconnected',
    battery: null,
    signal: null,
    packetCount: 0,
    lastPacketSize: null,
}));

const DeviceConnection = () => {
    const navigate = useNavigate();
    const [devices, setDevices] = useState(createInitialDevices);
    const [isResetting, setIsResetting] = useState(false);
    const [isConnectingAll, setIsConnectingAll] = useState(false);
    const [error, setError] = useState(null);
    const [bleSupported, setBleSupported] = useState(false);
    const [discoveryMode, setDiscoveryMode] = useState(() => getRealtimeTransportMode());

    useEffect(() => {
        setBleSupported(isWebBluetoothSupported());
    }, []);

    useEffect(() => {
        const unsubscribeMode = subscribeToRealtimeTransportMode((nextMode) => {
            setDiscoveryMode(nextMode);
            if (nextMode === TRANSPORT_MODE_WEB_BLUETOOTH) {
                setDevices(getBrowserBleDevicesSnapshot());
            }
        });

        const unsubscribeDevices = subscribeToBrowserBleDevices((nextDevices) => {
            if (getRealtimeTransportMode() === TRANSPORT_MODE_WEB_BLUETOOTH) {
                setDevices(nextDevices);
            }
        });

        if (getRealtimeTransportMode() === TRANSPORT_MODE_WEB_BLUETOOTH) {
            setDevices(getBrowserBleDevicesSnapshot());
        }

        return () => {
            unsubscribeMode();
            unsubscribeDevices();
        };
    }, []);

    useEffect(() => {
        if (!bleSupported) {
            return;
        }

        autoConnectBrowserBleDevices().catch(() => {});
    }, [bleSupported]);

    const handleConnectDevice = async (positionId) => {
        if (!bleSupported) {
            setError('Web Bluetooth is not available in this browser. Use Bluefy or a compatible Chromium browser.');
            return;
        }

        setError(null);
        try {
            await connectBrowserBleDevice(positionId, { preferKnownDevice: true });
        } catch (connectionError) {
            if (connectionError?.name === 'NotFoundError') {
                return;
            }
            const message = connectionError instanceof Error
                ? connectionError.message
                : 'Web Bluetooth connection failed.';
            setError(message);
        }
    };

    const handleConnectAll = async () => {
        if (!bleSupported) {
            setError('Web Bluetooth is not available in this browser. Use Bluefy or a compatible Chromium browser.');
            return;
        }

        setError(null);
        setIsConnectingAll(true);
        try {
            await connectAllBrowserBleDevices();
        } catch (connectionError) {
            if (connectionError?.name !== 'NotFoundError') {
                const message = connectionError instanceof Error
                    ? connectionError.message
                    : 'Web Bluetooth connection failed.';
                setError(message);
            }
        } finally {
            setIsConnectingAll(false);
        }
    };

    const handleReset = async () => {
        setError(null);
        setIsResetting(true);
        try {
            await resetBrowserBleDevices();
        } finally {
            setIsResetting(false);
        }
    };

    const getStatusInfo = (status) => {
        switch (status) {
            case 'connected':
                return {
                    icon: <CheckCircle2 className="w-6 h-6 text-green-600" strokeWidth={2.5} />,
                    color: 'text-green-700',
                    bgColor: 'bg-green-50',
                    borderColor: 'border-green-400',
                    text: 'Connected',
                };
            case 'connecting':
                return {
                    icon: <Loader2 className="w-6 h-6 text-blue-600 animate-spin" strokeWidth={2.5} />,
                    color: 'text-blue-700',
                    bgColor: 'bg-blue-50',
                    borderColor: 'border-blue-400',
                    text: 'Connecting...',
                };
            case 'scanning':
                return {
                    icon: <Radio className="w-6 h-6 text-gray-600 animate-pulse" strokeWidth={2.5} />,
                    color: 'text-gray-700',
                    bgColor: 'bg-gray-50',
                    borderColor: 'border-gray-400',
                    text: 'Scanning...',
                };
            case 'error':
                return {
                    icon: <AlertCircle className="w-6 h-6 text-red-600" strokeWidth={2.5} />,
                    color: 'text-red-700',
                    bgColor: 'bg-red-50',
                    borderColor: 'border-red-400',
                    text: 'Connection Failed',
                };
            default:
                return {
                    icon: <WifiOff className="w-6 h-6 text-red-500" strokeWidth={2.5} />,
                    color: 'text-red-600',
                    bgColor: 'bg-gray-50',
                    borderColor: 'border-red-300',
                    text: 'Not Connected',
                };
        }
    };

    const getBatteryInfo = (battery) => {
        if (!battery) return { color: 'text-gray-400', icon: <Battery className="w-4 h-4" /> };
        if (battery > 80) return { color: 'text-green-600', icon: <Battery className="w-4 h-4" /> };
        if (battery > 50) return { color: 'text-yellow-600', icon: <Battery className="w-4 h-4" /> };
        return { color: 'text-red-600', icon: <Battery className="w-4 h-4" /> };
    };

    const getSignalIcon = (signal) => {
        if (signal === 'Strong') return <Wifi className="w-4 h-4" />;
        if (signal === 'Medium') return <Radio className="w-4 h-4" />;
        if (signal === 'Streaming') return <Activity className="w-4 h-4" />;
        return <WifiOff className="w-4 h-4" />;
    };

    const getPositionIcon = (positionId) => {
        switch (positionId) {
            case 'PELVIS':
                return <Heart className="w-8 h-8 text-red-500" strokeWidth={2} />;
            case 'LEFT_THIGH':
                return <Footprints className="w-8 h-8 text-blue-500 rotate-12" strokeWidth={2} />;
            case 'RIGHT_THIGH':
                return <Footprints className="w-8 h-8 text-blue-500 -rotate-12" strokeWidth={2} />;
            case 'LEFT_SHANK':
                return <Footprints className="w-8 h-8 text-purple-500 rotate-12" strokeWidth={2} />;
            case 'RIGHT_SHANK':
                return <Footprints className="w-8 h-8 text-purple-500 -rotate-12" strokeWidth={2} />;
            default:
                return <Activity className="w-8 h-8 text-gray-500" strokeWidth={2} />;
        }
    };

    const connectedCount = devices.filter((device) => device.status === 'connected').length;
    const allConnected = connectedCount === BODY_POSITIONS.length;
    const streamingCount = devices.filter((device) => device.packetCount > 0).length;

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
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

            <main className="p-3 sm:p-4 lg:p-6 pb-6 max-w-7xl mx-auto">
                <div className="bg-white rounded-3xl shadow-2xl p-4 sm:p-6 mb-3 sm:mb-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                            <div className="flex-1 min-w-0">
                                <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-extrabold text-gray-900 tracking-tight break-words">
                                    Device Connection
                                </h1>
                                <p className="text-xs sm:text-sm md:text-base font-semibold text-gray-700 mt-1">
                                    {connectedCount}/{BODY_POSITIONS.length} Connected
                                    {streamingCount > 0 && (
                                        <span className="text-cyan-700"> · {streamingCount} streaming</span>
                                    )}
                                </p>
                                <p className="text-xs sm:text-sm font-medium text-gray-500 mt-1">
                                    Sensors auto-match by BLE name (e.g. DernDee_R_Shank)
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                                <button
                                    onClick={handleConnectAll}
                                    disabled={isConnectingAll || allConnected}
                                    className="px-4 sm:px-6 py-2 sm:py-3 rounded-full text-xs sm:text-sm md:text-base font-extrabold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all duration-300 shadow-lg hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 tracking-wide flex-shrink-0 w-full sm:w-auto"
                                >
                                    {isConnectingAll ? (
                                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                                    ) : (
                                        <Bluetooth className="w-4 h-4 sm:w-5 sm:h-5" />
                                    )}
                                    <span>Connect All</span>
                                </button>
                                <button
                                    onClick={handleReset}
                                    disabled={isResetting || isConnectingAll}
                                    className="px-4 sm:px-6 py-2 sm:py-3 rounded-full text-xs sm:text-sm md:text-base font-extrabold bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 tracking-wide flex-shrink-0 w-full sm:w-auto"
                                >
                                    <Search className={`w-4 h-4 sm:w-5 sm:h-5 ${isResetting ? 'animate-spin' : ''}`} />
                                    <span>Reset Devices</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="bg-gradient-to-r from-red-50 via-red-100 to-red-50 border-2 border-red-400 rounded-3xl shadow-2xl p-4 sm:p-5 mb-3 sm:mb-4 animate-pulse">
                        <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                                <XCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-600 animate-bounce" />
                            </div>
                            <p className="text-sm sm:text-base md:text-lg font-bold text-red-800 flex-1 leading-relaxed">
                                {error}
                            </p>
                            <button
                                onClick={() => setError(null)}
                                className="text-red-600 hover:text-red-800 text-2xl font-bold hover:bg-red-200 rounded-full w-8 h-8 flex items-center justify-center transition-all"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-3 sm:mb-4">
                    {devices.map((device) => {
                        const statusInfo = getStatusInfo(device.status);
                        const batteryInfo = device.battery !== null ? getBatteryInfo(device.battery) : null;

                        return (
                            <div
                                key={device.positionId}
                                className={`bg-white rounded-3xl shadow-xl p-6 sm:p-7 border-2 ${statusInfo.borderColor} transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]`}
                            >
                                <div className="flex items-start justify-between mb-5">
                                    <div className="flex items-start gap-4 flex-1">
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center border-2 border-blue-200 shadow-md flex-shrink-0">
                                            {getPositionIcon(device.positionId)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg sm:text-xl md:text-2xl font-extrabold text-gray-900 mb-2 tracking-tight">
                                                {device.positionName}
                                            </h3>
                                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${statusInfo.bgColor} ${statusInfo.color} border-2 ${statusInfo.borderColor}`}>
                                                {statusInfo.icon}
                                                <span className="text-xs sm:text-sm font-bold tracking-wide">
                                                    {statusInfo.text}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {device.status === 'error' && (
                                        <button
                                            onClick={() => handleConnectDevice(device.positionId)}
                                            className="p-2.5 hover:bg-red-50 rounded-xl transition-all hover:scale-110 flex-shrink-0"
                                            title="Retry Connection"
                                        >
                                            <RefreshCw className="w-5 h-5 text-red-600" />
                                        </button>
                                    )}
                                </div>

                                {device.deviceName && (
                                    <div className="mb-5 p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 rounded-2xl border-2 border-blue-200 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                                    BLE Device Name
                                                </p>
                                                <p className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight">
                                                    {device.deviceName}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-5 text-xs sm:text-sm pt-3 border-t border-blue-200">
                                            {device.battery !== null && (
                                                <div className={`flex items-center gap-2 font-bold ${batteryInfo.color}`}>
                                                    {batteryInfo.icon}
                                                    <span>{device.battery}%</span>
                                                </div>
                                            )}
                                            {device.signal && (
                                                <div className="flex items-center gap-2 text-gray-700 font-semibold">
                                                    {getSignalIcon(device.signal)}
                                                    <span>{device.signal}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 text-cyan-700 font-semibold">
                                                <Activity className="w-4 h-4" />
                                                <span>{device.packetCount} packets</span>
                                            </div>
                                            {device.lastPacketSize !== null && (
                                                <div className="flex items-center gap-2 text-cyan-700 font-semibold">
                                                    <Radio className="w-4 h-4" />
                                                    <span>{device.lastPacketSize} bytes</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {!device.deviceName && (
                                    <div className="mb-5 p-4 bg-gradient-to-br from-gray-50 to-slate-50 rounded-2xl border-2 border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Radio className="w-4 h-4 text-gray-500" />
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                BLE Device Name
                                            </p>
                                        </div>
                                        <p className="text-sm font-mono font-bold text-gray-800 bg-white px-3 py-2 rounded-lg border border-gray-200">
                                            {device.expectedDeviceId}
                                        </p>
                                    </div>
                                )}

                                <div className={`h-1 rounded-full ${statusInfo.bgColor} ${statusInfo.borderColor} border`}>
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${device.status === 'connected' ? 'bg-green-500 w-full' :
                                            device.status === 'connecting' ? 'bg-blue-500 w-3/4 animate-pulse' :
                                                device.status === 'scanning' ? 'bg-gray-400 w-1/2 animate-pulse' :
                                                    device.status === 'error' ? 'bg-red-500 w-1/4' :
                                                        'bg-gray-300 w-0'
                                            }`}
                                    />
                                </div>

                                <div className="mt-4 flex gap-3">
                                    {device.status === 'connected' ? (
                                        <button
                                            onClick={() => disconnectBrowserBleDevice(device.positionId, { forgetDevice: true })}
                                            className="flex-1 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-extrabold text-red-700 transition-all duration-300 hover:bg-red-100"
                                        >
                                            Disconnect
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleConnectDevice(device.positionId)}
                                            disabled={device.status === 'connecting' || isConnectingAll}
                                            className="flex-1 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-700 transition-all duration-300 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {device.status === 'connecting' ? 'Waiting for device...' : 'Connect via BLE'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {allConnected && discoveryMode === TRANSPORT_MODE_WEB_BLUETOOTH && (
                    <div className="bg-gradient-to-r from-green-50 via-emerald-50 to-green-50 border-2 border-green-400 rounded-3xl shadow-2xl p-4 sm:p-5 mt-3 sm:mt-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 flex-1">
                                <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 flex-shrink-0 animate-pulse" />
                                <div className="flex-1">
                                    <p className="text-base sm:text-lg md:text-xl font-extrabold text-green-800 tracking-tight">
                                        All sensors connected.
                                    </p>
                                    <p className="text-sm sm:text-base font-semibold text-green-700 mt-1">
                                        Continue to therapy without reconnecting.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => navigate('/therapy')}
                                className="px-6 py-3 rounded-full text-sm sm:text-base font-extrabold bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white transition-all duration-300 shadow-lg hover:shadow-2xl flex items-center gap-2 tracking-wide whitespace-nowrap"
                            >
                                <span>Go to Therapy</span>
                                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default DeviceConnection;
