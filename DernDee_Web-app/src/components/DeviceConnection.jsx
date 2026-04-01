import React, { useState, useEffect } from 'react';
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
    Activity
} from 'lucide-react';
import derndeeLogo from '../assets/images/derndee-logo.png';

const BODY_POSITIONS = [
    { id: 'PELVIS', name: 'Chest', order: 1, deviceId: 'DernDee_Sensor_001' },
    { id: 'LEFT_THIGH', name: 'Left Thigh', order: 2, deviceId: 'DernDee_Sensor_002' },
    { id: 'RIGHT_THIGH', name: 'Right Thigh', order: 3, deviceId: 'DernDee_Sensor_003' },
    { id: 'LEFT_SHANK', name: 'Left Ankle', order: 4, deviceId: 'DernDee_Sensor_004' },
    { id: 'RIGHT_SHANK', name: 'Right Ankle', order: 5, deviceId: 'DernDee_Sensor_005' },
];

const DeviceConnection = () => {
    const navigate = useNavigate();

    console.log('DeviceConnection component rendered');

    const [devices, setDevices] = useState(() => {
        const initialDevices = BODY_POSITIONS.map(pos => ({
            positionId: pos.id,
            positionName: pos.name,
            order: pos.order,
            expectedDeviceId: pos.deviceId, // Expected device ID for this position
            deviceId: null,
            deviceName: null,
            status: 'disconnected', // 'disconnected', 'scanning', 'connecting', 'connected', 'error'
            battery: null,
            signal: null,
        }));
        console.log('Initial devices:', initialDevices);
        return initialDevices;
    });

    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);
    const [bleSupported, setBleSupported] = useState(false);

    // Check BLE support
    useEffect(() => {
        if ('bluetooth' in navigator) {
            setBleSupported(true);
        } else {
            setBleSupported(false);
            setError('Bluetooth not supported');
        }
    }, []);


    // Simulate device discovery - devices with matching IDs
    const simulateDeviceDiscovery = () => {
        // Simulate: sometimes devices are found, sometimes not
        // For testing error state, you can comment out some devices to simulate "not found"
        const mockDevices = [
            { id: 'DernDee_Sensor_001', name: 'Sensor 001', battery: 95, signal: 'Strong' },
            // { id: 'DernDee_Sensor_002', name: 'Sensor 002', battery: 88, signal: 'Medium' }, // Uncomment to test error
            { id: 'DernDee_Sensor_002', name: 'Sensor 002', battery: 88, signal: 'Medium' },
            { id: 'DernDee_Sensor_003', name: 'Sensor 003', battery: 92, signal: 'Strong' },
            // { id: 'DernDee_Sensor_004', name: 'Sensor 004', battery: 85, signal: 'Medium' }, // Uncomment to test error
            { id: 'DernDee_Sensor_004', name: 'Sensor 004', battery: 85, signal: 'Medium' },
            { id: 'DernDee_Sensor_005', name: 'Sensor 005', battery: 90, signal: 'Strong' },
        ];

        setIsScanning(false);

        // Check which devices are not found
        const notFoundDevices = [];

        // Auto-connect devices based on expected device ID
        setDevices(prev => prev.map(device => {
            if (device.status === 'connected') {
                return device; // Skip already connected devices
            }

            const foundDevice = mockDevices.find(d => d.id === device.expectedDeviceId);
            if (foundDevice && (device.status === 'disconnected' || device.status === 'scanning')) {
                // Auto start connection
                setTimeout(() => {
                    connectDevice(device.positionId, foundDevice);
                }, 500);
                return { ...device, status: 'connecting' };
            } else if (device.status === 'scanning') {
                // Device not found
                notFoundDevices.push(device.positionName);
                return { ...device, status: 'error' };
            }
            return device;
        }));

        // Show error if devices not found
        if (notFoundDevices.length > 0) {
            setError(`Devices not found: ${notFoundDevices.join(', ')}. Please check if devices are powered on and try again.`);
        }
    };

    // Start scanning for all devices
    const startScan = async () => {
        setIsScanning(true);
        setError(null);

        // Set all disconnected/error devices to scanning
        setDevices(prev => prev.map(device =>
            device.status === 'disconnected' || device.status === 'error'
                ? { ...device, status: 'scanning', deviceId: null, deviceName: null, battery: null, signal: null }
                : device
        ));

        // Simulate scanning delay
        setTimeout(() => {
            if (bleSupported) {
                simulateDeviceDiscovery();
            } else {
                simulateDeviceDiscovery();
            }
        }, 2000);
    };

    // Connect device to position
    const connectDevice = async (positionId, deviceData) => {
        // Update device status to connecting
        setDevices(prev => prev.map(d =>
            d.positionId === positionId
                ? {
                    ...d,
                    status: 'connecting',
                    deviceId: deviceData.id,
                    deviceName: deviceData.name,
                    battery: deviceData.battery,
                    signal: deviceData.signal
                }
                : d
        ));

        try {
            // Simulate connection delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            // In real implementation, connect via BLE here
            // await BleManager.connect(deviceData.id, { timeout: 10000, retries: 3 });

            // Update device status to connected
            setDevices(prev => prev.map(d =>
                d.positionId === positionId
                    ? { ...d, status: 'connected' }
                    : d
            ));

        } catch (error) {
            console.error('Connection error:', error);
            setDevices(prev => prev.map(d =>
                d.positionId === positionId
                    ? { ...d, status: 'error' }
                    : d
            ));
        }
    };

    // Refresh specific device
    const refreshDevice = async (positionId) => {
        setDevices(prev => prev.map(d =>
            d.positionId === positionId
                ? { ...d, status: 'scanning', deviceId: null, deviceName: null, battery: null, signal: null }
                : d
        ));

        // Simulate scanning and auto-connect
        setTimeout(() => {
            simulateDeviceDiscovery();
        }, 1500);
    };

    // Get status info
    const getStatusInfo = (status) => {
        switch (status) {
            case 'connected':
                return {
                    icon: <CheckCircle2 className="w-6 h-6 text-green-600" strokeWidth={2.5} />,
                    color: 'text-green-700',
                    bgColor: 'bg-green-50',
                    borderColor: 'border-green-400',
                    iconBg: 'bg-green-100',
                    text: 'Connected'
                };
            case 'connecting':
                return {
                    icon: <Loader2 className="w-6 h-6 text-blue-600 animate-spin" strokeWidth={2.5} />,
                    color: 'text-blue-700',
                    bgColor: 'bg-blue-50',
                    borderColor: 'border-blue-400',
                    iconBg: 'bg-blue-100',
                    text: 'Connecting...'
                };
            case 'scanning':
                return {
                    icon: <Radio className="w-6 h-6 text-gray-600 animate-pulse" strokeWidth={2.5} />,
                    color: 'text-gray-700',
                    bgColor: 'bg-gray-50',
                    borderColor: 'border-gray-400',
                    iconBg: 'bg-gray-100',
                    text: 'Scanning...'
                };
            case 'error':
                return {
                    icon: <AlertCircle className="w-6 h-6 text-red-600" strokeWidth={2.5} />,
                    color: 'text-red-700',
                    bgColor: 'bg-red-50',
                    borderColor: 'border-red-400',
                    iconBg: 'bg-red-100',
                    text: 'Connection Failed'
                };
            default:
                return {
                    icon: <WifiOff className="w-6 h-6 text-red-500" strokeWidth={2.5} />,
                    color: 'text-red-600',
                    bgColor: 'bg-gray-50',
                    borderColor: 'border-red-300',
                    iconBg: 'bg-gray-100',
                    text: 'Not Connected'
                };
        }
    };

    // Get battery color and icon
    const getBatteryInfo = (battery) => {
        if (!battery) return { color: 'text-gray-400', icon: <Battery className="w-4 h-4" /> };
        if (battery > 80) return { color: 'text-green-600', icon: <Battery className="w-4 h-4" /> };
        if (battery > 50) return { color: 'text-yellow-600', icon: <Battery className="w-4 h-4" /> };
        return { color: 'text-red-600', icon: <Battery className="w-4 h-4" /> };
    };

    // Get signal icon
    const getSignalIcon = (signal) => {
        if (signal === 'Strong') return <Wifi className="w-4 h-4" />;
        if (signal === 'Medium') return <Radio className="w-4 h-4" />;
        return <WifiOff className="w-4 h-4" />;
    };

    // Get position icon based on body position
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

    const connectedCount = devices.filter(d => d.status === 'connected').length;
    const allConnected = connectedCount === 5;

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header */}
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
            <main className="p-3 sm:p-4 lg:p-6 pb-6 max-w-7xl mx-auto">
                {/* Title Card */}
                <div className="bg-white rounded-3xl shadow-2xl p-4 sm:p-6 mb-3 sm:mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-3 sm:gap-4 flex-1 min-w-0">
                            {/* <button
                                onClick={() => navigate('/home')}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                            >
                                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                            </button> */}
                            <div className="flex-1 min-w-0">
                                <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-extrabold text-gray-900 tracking-tight break-words">
                                    Device Connection
                                </h1>
                                <p className="text-xs sm:text-sm md:text-base font-semibold text-gray-700 mt-1">
                                    {connectedCount}/5 Connected
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={startScan}
                            disabled={isScanning}
                            className="px-4 sm:px-6 py-2 sm:py-3 rounded-full text-xs sm:text-sm md:text-base font-extrabold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all duration-300 shadow-lg hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 tracking-wide flex-shrink-0 w-full sm:w-auto"
                        >
                            <Search className={`w-4 h-4 sm:w-5 sm:h-5 ${isScanning ? 'animate-spin' : ''}`} />
                            <span>{isScanning ? 'Scanning...' : 'Scan Devices'}</span>
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
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

                {/* Success Banner - All Connected */}
                {allConnected && (
                    <div className="bg-gradient-to-r from-green-50 via-emerald-50 to-green-50 border-2 border-green-400 rounded-3xl shadow-2xl p-4 sm:p-5 mb-3 sm:mb-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 flex-1">
                                <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 flex-shrink-0 animate-pulse" />
                                <div className="flex-1">
                                    <p className="text-base sm:text-lg md:text-xl font-extrabold text-green-800 tracking-tight">
                                        All devices connected successfully!
                                    </p>
                                    <p className="text-sm sm:text-base font-semibold text-green-700 mt-1">
                                        Ready to start therapy session
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

                {/* Devices Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-3 sm:mb-4">
                    {devices.map((device) => {
                        const statusInfo = getStatusInfo(device.status);
                        const batteryInfo = device.battery !== null ? getBatteryInfo(device.battery) : null;

                        return (
                            <div
                                key={device.positionId}
                                className={`bg-white rounded-3xl shadow-xl p-6 sm:p-7 border-2 ${statusInfo.borderColor} transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]`}
                            >
                                {/* Device Header */}
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
                                            onClick={() => refreshDevice(device.positionId)}
                                            className="p-2.5 hover:bg-red-50 rounded-xl transition-all hover:scale-110 flex-shrink-0"
                                            title="Retry Connection"
                                        >
                                            <RefreshCw className="w-5 h-5 text-red-600" />
                                        </button>
                                    )}
                                </div>

                                {/* Device Info - Connected */}
                                {device.deviceName && (
                                    <div className="mb-5 p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 rounded-2xl border-2 border-blue-200 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight mb-1">
                                                    {device.deviceName}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono font-semibold text-gray-600 bg-white px-2 py-1 rounded-md border border-gray-200">
                                                        {device.deviceId}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-5 text-xs sm:text-sm pt-3 border-t border-blue-200">
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
                                        </div>
                                    </div>
                                )}

                                {/* Expected Device ID - Not Connected */}
                                {!device.deviceName && (
                                    <div className="mb-5 p-4 bg-gradient-to-br from-gray-50 to-slate-50 rounded-2xl border-2 border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Radio className="w-4 h-4 text-gray-500" />
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                Expected Device
                                            </p>
                                        </div>
                                        <p className="text-sm font-mono font-bold text-gray-800 bg-white px-3 py-2 rounded-lg border border-gray-200">
                                            {device.expectedDeviceId}
                                        </p>
                                    </div>
                                )}

                                {/* Status Indicator Line */}
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
                            </div>
                        );
                    })}
                </div>

            </main>
        </div>
    );
};

export default DeviceConnection; 
