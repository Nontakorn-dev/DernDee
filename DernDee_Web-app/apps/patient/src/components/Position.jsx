import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bluetooth, ArrowLeft } from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';
import devicePositionImageSrc from '@shared/assets/images/devicePositionImage.png';

const Position = () => {
    const navigate = useNavigate();
    const [isConnected, setIsConnected] = useState(false);
    const [connectedDevices, setConnectedDevices] = useState([]);
    // ใช้ imported image
    const [devicePositionImage, setDevicePositionImage] = useState(devicePositionImageSrc);

    const handleConnectDevice = () => {
        navigate('/device-connection');
    };


    // Update connection status
    React.useEffect(() => {
        setIsConnected(connectedDevices.length > 0);
    }, [connectedDevices]);

    const handleStartRecording = () => {
        // Navigate to calibration page
        navigate('/calibration');
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 lg:px-8 py-5 sm:py-6 md:py-7 flex items-center justify-start h-20 sm:h-24 md:h-28">
                <div className="w-40 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 flex items-center justify-center">
                    <img 
                        src={derndeeLogo} 
                        alt="Derndee Logo" 
                        className="w-full h-full object-contain"
                    />
                </div>
            </header>

            {/* Main Content */}
            <main className="p-3 sm:p-4 lg:p-6 pb-6 max-w-full mx-auto">
                {/* Mobile: Separate Cards */}
                {/* Title Card with Back Button - Mobile/Tablet Portrait Only */}
                <div className="block lg:hidden bg-white rounded-3xl shadow-2xl p-4 sm:p-6 mb-3 sm:mb-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                        <button
                            onClick={() => navigate('/home')}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                        </button>
                        <h1 className="text-lg sm:text-xl font-bold text-gray-800">
                            Position the devices
                        </h1>
                    </div>
                </div>

                {/* Connection Status Card - Mobile/Tablet Portrait Only */}
                <div className={`block lg:hidden rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 mb-3 sm:mb-4 transition-all duration-300 ${
                    isConnected 
                        ? 'bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200' 
                        : 'bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200'
                }`}>
                    <div className="flex items-center justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center ${
                                isConnected 
                                    ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50' 
                                    : 'bg-red-500 shadow-lg shadow-red-500/50'
                            }`}>
                                <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${
                                    isConnected ? 'bg-white' : 'bg-white animate-pulse'
                                }`}></div>
                            </div>
                            <div className="flex flex-col">
                                <span className={`text-base sm:text-lg md:text-xl font-bold ${
                                    isConnected ? 'text-green-700' : 'text-red-700'
                                }`}>
                                    {isConnected ? 'Connected' : 'Disconnected'}
                                </span>
                                {connectedDevices.length > 0 && (
                                    <span className="text-xs sm:text-sm text-gray-600 mt-1">
                                        {connectedDevices.length} device{connectedDevices.length > 1 ? 's' : ''} connected
                                    </span>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={handleConnectDevice}
                            className="px-5 sm:px-7 py-2.5 sm:py-3.5 rounded-full text-sm sm:text-base md:text-lg font-bold transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                        >
                            <div className="flex items-center justify-center gap-2">
                                <Bluetooth className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span>{isConnected ? 'Manage' : 'Connect'}</span>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Image Card - Mobile/Tablet Portrait Only */}
                <div className="block lg:hidden bg-white rounded-3xl shadow-2xl p-3 sm:p-4 md:p-6 mb-3 sm:mb-4">
                    <div className="w-full h-auto min-h-[250px] sm:min-h-[350px] rounded-2xl bg-gray-100 flex items-center justify-center overflow-hidden mb-3 sm:mb-4">
                        {devicePositionImage ? (
                            <img 
                                src={devicePositionImage} 
                                alt="Device Position Guide" 
                                className="w-full h-full object-contain"
                                loading="lazy"
                            />
                        ) : (
                            <div className="text-center p-4 sm:p-6 md:p-8">
                                <div className="text-4xl sm:text-6xl md:text-8xl mb-3 sm:mb-4">📱</div>
                                <p className="text-gray-500 text-xs sm:text-sm md:text-base">
                                    ใส่ path รูปภาพการติดตั้งอุปกรณ์
                                </p>
                                <p className="text-gray-400 text-xs mt-2">
                                    แก้ไข devicePositionImage ใน state
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleStartRecording}
                        className="w-full py-3 sm:py-4 md:py-5 rounded-2xl text-sm sm:text-base md:text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg"
                    >
                        START CALIBRATION
                    </button>
                </div>

                {/* Desktop/Tablet Landscape: Combined Card */}
                <div className="hidden lg:block bg-white rounded-3xl shadow-2xl p-4 md:p-6 lg:p-8 mb-3 sm:mb-4">
                    {/* Title Section - Full Width at Top */}
                    <div className="mb-5 md:mb-6 lg:mb-8 pb-4 md:pb-5 lg:pb-6 border-b border-gray-200">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <button
                                onClick={() => navigate('/home')}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                            >
                                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                            </button>
                            <h1 className="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-800">
                                Position the devices
                            </h1>
                        </div>
                    </div>

                    {/* Layout: Horizontal - Image Left, Controls Right */}
                    <div className="flex flex-row gap-6 md:gap-8 lg:gap-10 items-stretch">
                        {/* Image Section - Left (Smaller) */}
                        <div className="w-[42%] md:w-[40%] lg:w-[38%] flex-shrink-0">
                            <div className="w-full h-full max-h-[600px] md:max-h-[650px] lg:max-h-[700px] rounded-2xl bg-gray-100 flex items-center justify-center overflow-hidden p-4">
                                {devicePositionImage ? (
                                    <img 
                                        src={devicePositionImage} 
                                        alt="Device Position Guide" 
                                        className="w-full h-full object-contain"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="text-center p-4 sm:p-6 md:p-8">
                                        <div className="text-4xl sm:text-6xl md:text-8xl mb-3 sm:mb-4">📱</div>
                                        <p className="text-gray-500 text-xs sm:text-sm md:text-base">
                                            ใส่ path รูปภาพการติดตั้งอุปกรณ์
                                        </p>
                                        <p className="text-gray-400 text-xs mt-2">
                                            แก้ไข devicePositionImage ใน state
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Right Section - Connection Status and Button (Larger) */}
                        <div className="w-[58%] md:w-[60%] lg:w-[62%] flex flex-col justify-center gap-5 md:gap-6 lg:gap-8">
                            {/* Connection Status Card */}
                            <div className={`rounded-2xl sm:rounded-3xl shadow-xl p-5 md:p-6 lg:p-7 transition-all duration-300 ${
                                isConnected 
                                    ? 'bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200' 
                                    : 'bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200'
                            }`}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                                            isConnected 
                                                ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50' 
                                                : 'bg-red-500 shadow-lg shadow-red-500/50'
                                        }`}>
                                            <div className={`w-3 h-3 md:w-3.5 md:h-3.5 rounded-full ${
                                                isConnected ? 'bg-white' : 'bg-white animate-pulse'
                                            }`}></div>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`text-lg md:text-xl lg:text-2xl font-bold ${
                                                isConnected ? 'text-green-700' : 'text-red-700'
                                            }`}>
                                                {isConnected ? 'Connected' : 'Disconnected'}
                                            </span>
                                            {connectedDevices.length > 0 && (
                                                <span className="text-sm md:text-base text-gray-600 mt-1">
                                                    {connectedDevices.length} device{connectedDevices.length > 1 ? 's' : ''} connected
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleConnectDevice}
                                        className="px-6 md:px-8 py-3 md:py-4 rounded-full text-base md:text-lg lg:text-xl font-bold transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white flex-shrink-0"
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <Bluetooth className="w-5 h-5 md:w-6 md:h-6" />
                                            <span>{isConnected ? 'Manage' : 'Connect'}</span>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Instruction Card */}
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl sm:rounded-3xl shadow-xl p-5 md:p-6 lg:p-7">
                                <h3 className="text-base md:text-lg lg:text-xl xl:text-2xl font-bold text-gray-800 mb-3 md:mb-4">
                                    คำแนะนำการติดตั้งอุปกรณ์
                                </h3>
                                <div className="space-y-2 md:space-y-3">
                                    <p className="text-sm md:text-base lg:text-lg text-gray-700 leading-relaxed">
                                        กรุณาติดตั้งอุปกรณ์บริเวณ <span className="font-semibold text-blue-700">5 จุด</span> ตามที่แสดงในรูปภาพ:
                                    </p>
                                    <ul className="space-y-2 md:space-y-2.5 text-sm md:text-base lg:text-lg text-gray-700">
                                        <li className="flex items-start gap-2">
                                            <span className="text-blue-600 font-bold mt-0.5">1.</span>
                                            <span>บริเวณหน้าอก (Chest)</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-blue-600 font-bold mt-0.5">2.</span>
                                            <span>เหนือเข่าขวา (Above Right Knee)</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-blue-600 font-bold mt-0.5">3.</span>
                                            <span>เหนือเข่าซ้าย (Above Left Knee)</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-blue-600 font-bold mt-0.5">4.</span>
                                            <span>เหนือข้อเท้าขวา (Above Right Ankle)</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-blue-600 font-bold mt-0.5">5.</span>
                                            <span>เหนือข้อเท้าซ้าย (Above Left Ankle)</span>
                                        </li>
                                    </ul>
                                    
                                </div>
                            </div>
                            
                            {/* Button Section */}
                            <button
                                onClick={handleStartRecording}
                                className="w-full py-4 md:py-5 lg:py-6 xl:py-7 rounded-2xl text-base md:text-lg lg:text-xl xl:text-2xl font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg hover:shadow-xl"
                            >
                                START CALIBRATION
                            </button>
                        </div>
                    </div>
                </div>
            </main>

        </div>
    );
};

export default Position;

