import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { ArrowLeft, Footprints, Gauge, TrendingUp, Clock, Zap } from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';
// User will provide the doctor image path
import doctorEncouragementSrc from '@shared/assets/images/good-boy.png';

const WalkSummary = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useUserAuth();

    // Doctor image state - user will set the path
    const [doctorImage, setDoctorImage] = useState(doctorEncouragementSrc);

    // Get session data from navigation state or use defaults
    const sessionState = location.state || {};

    // Session data - combine from navigation state and defaults
    const [sessionData] = useState({
        patientName: user?.displayName || 'ผู้ใช้งาน',
        patientId: user?.uid?.substring(0, 8) || '12345',
        // Real gait metrics from WalkSession
        cadence: sessionState.cadence || 0,
        stepLength: sessionState.stepLength || 0,
        strideLength: sessionState.strideLength || 0,
        walkingSpeed: sessionState.walkingSpeed || 0,
        clearance: sessionState.clearance || 0,
        // Session info
        duration: sessionState.duration || '00:00',
        totalSteps: sessionState.steps || sessionState.totalSteps || 0
    });

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button> */}
                    <img src={derndeeLogo} alt="DernDee" className="h-10 sm:h-12 object-contain" />
                </div>
                <div className="text-center">
                    {/* <h1 className="text-xl sm:text-2xl font-extrabold text-gray-800">Walk Summary</h1> */}
                </div>
                <div className="w-10"></div> {/* Spacer for centering */}
            </header>

            {/* Main Content */}
            <main className="p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8 pb-6 max-w-7xl mx-auto">


                {/* Doctor Encouragement Card */}
                {/*<div className="bg-gradient-to-br from-white via-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl sm:rounded-3xl shadow-2xl p-2 sm:p-2.5 md:p-3 lg:p-3.5 mb-3 sm:mb-4 md:mb-5">
                    <div className="w-full aspect-[4/3] sm:aspect-[3/2] max-h-[180px] sm:max-h-[220px] md:max-h-[260px] lg:max-h-[300px] rounded-xl sm:rounded-2xl overflow-hidden bg-transparent mx-auto">
                        {doctorImage && (
                            <img
                                src={doctorImage}
                                alt="Doctor Encouragement"
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        )}
                    </div>
                </div>

                {/* Gait Parameters Card */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold text-gray-800 mb-4 sm:mb-5 md:mb-6 flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                        Gait Parameters
                    </h3>

                    {/* Grid Layout - 2 columns, 3 rows */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                        {/* Cadence */}
                        <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100 hover:border-blue-300 transition-colors">
                            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                <Footprints className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-blue-600 flex-shrink-0" />
                                <label className="text-xs sm:text-sm md:text-base font-semibold text-gray-600">
                                    Cadence
                                </label>
                            </div>
                            <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900">
                                {sessionData.cadence}
                            </div>
                            <div className="text-xs sm:text-sm md:text-base text-gray-600 font-semibold mt-1 sm:mt-2">
                                steps/min
                            </div>
                        </div>

                        {/* Step Length */}
                        <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100 hover:border-blue-300 transition-colors">
                            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                <Footprints className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-blue-600 flex-shrink-0" />
                                <label className="text-xs sm:text-sm md:text-base font-semibold text-gray-600">
                                    Step Length
                                </label>
                            </div>
                            <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900">
                                {sessionData.stepLength.toFixed(2)}
                            </div>
                            <div className="text-xs sm:text-sm md:text-base text-gray-600 font-semibold mt-1 sm:mt-2">
                                m
                            </div>
                        </div>

                        {/* Stride Length */}
                        <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100 hover:border-blue-300 transition-colors">
                            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                <Footprints className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-blue-600 flex-shrink-0" />
                                <label className="text-xs sm:text-sm md:text-base font-semibold text-gray-600">
                                    Stride Length
                                </label>
                            </div>
                            <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900">
                                {sessionData.strideLength.toFixed(2)}
                            </div>
                            <div className="text-xs sm:text-sm md:text-base text-gray-600 font-semibold mt-1 sm:mt-2">
                                m
                            </div>
                        </div>

                        {/* Walking Speed */}
                        <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100 hover:border-blue-300 transition-colors">
                            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                <Gauge className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-amber-600 flex-shrink-0" />
                                <label className="text-xs sm:text-sm md:text-base font-semibold text-gray-600">
                                    Walking Speed
                                </label>
                            </div>
                            <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900">
                                {sessionData.walkingSpeed.toFixed(1)}
                            </div>
                            <div className="text-xs sm:text-sm md:text-base text-gray-600 font-semibold mt-1 sm:mt-2">
                                m/s
                            </div>
                        </div>

                        {/* Foot Clearance */}
                        <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100 hover:border-blue-300 transition-colors sm:col-span-2">
                            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-green-600 flex-shrink-0" />
                                <label className="text-xs sm:text-sm md:text-base font-semibold text-gray-600">
                                    Foot Clearance (Avg)
                                </label>
                            </div>
                            <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900">
                                {(sessionData.clearance * 100).toFixed(1)} cm
                            </div>
                            <div className="text-xs sm:text-sm md:text-base text-gray-600 font-semibold mt-1 sm:mt-2">
                                max toe height during swing
                            </div>
                        </div>
                    </div>
                </div>

                {/* Session Summary Card */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <Clock className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                        Session Summary
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                        <div className="bg-blue-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-200">
                            <div className="text-xs sm:text-sm md:text-base font-semibold text-gray-600 mb-2 sm:mb-3">
                                Total Steps
                            </div>
                            <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-blue-600">
                                {sessionData.totalSteps}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-600 font-semibold mt-1 sm:mt-2">
                                steps
                            </div>
                        </div>
                        <div className="bg-blue-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-200">
                            <div className="text-xs sm:text-sm md:text-base font-semibold text-gray-600 mb-2 sm:mb-3">
                                Duration
                            </div>
                            <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-blue-600">
                                {sessionData.duration}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-600 font-semibold mt-1 sm:mt-2">
                                minutes
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 md:gap-5">
                    <button
                        onClick={() => navigate('/home')}
                        className="flex-1 py-3 sm:py-4 md:py-5 rounded-2xl text-base sm:text-lg md:text-xl font-extrabold bg-blue-500 hover:bg-blue-600 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                    >
                        Back to Home
                    </button>
                    <button
                        onClick={() => navigate('/therapy')}
                        className="flex-1 py-3 sm:py-4 md:py-5 rounded-2xl text-base sm:text-lg md:text-xl font-extrabold bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                    >
                        Walk Again
                    </button>
                </div>
            </main>
        </div>
    );
};

export default WalkSummary;

