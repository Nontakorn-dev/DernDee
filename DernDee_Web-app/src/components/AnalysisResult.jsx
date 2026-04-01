import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '../context/UserAuthContext';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Footprints, Gauge, TrendingUp, Clock, Zap, Calendar, Inbox } from 'lucide-react';
import derndeeLogo from '../assets/images/derndee-logo.png';

const AnalysisResult = () => {
    const navigate = useNavigate();
    const { user } = useUserAuth();
    const [loading, setLoading] = useState(true);
    const [latestSession, setLatestSession] = useState(null);

    useEffect(() => {
        const fetchLatestSession = async () => {
            if (user) {
                try {
                    // Query the latest walk session for this user
                    const sessionsRef = collection(db, 'walkSessions');
                    const q = query(
                        sessionsRef,
                        where('userId', '==', user.uid),
                        orderBy('createdAt', 'desc'),
                        limit(1)
                    );
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        const sessionData = querySnapshot.docs[0].data();
                        setLatestSession({
                            id: querySnapshot.docs[0].id,
                            ...sessionData
                        });
                    } else {
                        // Use mock data if no session found
                        setLatestSession({
                            id: 'mock-1',
                            cadence: 110,
                            stepLength: 0.75,
                            strideLength: 1.5,
                            walkingSpeed: 1.2,
                            doubleSupportTime: 25,
                            singleSupportTime: 40,
                            duration: '05:00',
                            totalSteps: 280,
                            steps: 280,
                            createdAt: new Date(),
                            date: new Date()
                        });
                    }
                } catch (error) {
                    console.error("Error fetching latest session:", error);
                    // Use mock data on error
                    setLatestSession({
                        id: 'mock-1',
                        cadence: 110,
                        stepLength: 0.75,
                        strideLength: 1.5,
                        walkingSpeed: 1.2,
                        doubleSupportTime: 25,
                        singleSupportTime: 40,
                        duration: '05:00',
                        totalSteps: 280,
                        steps: 280,
                        createdAt: new Date(),
                        date: new Date()
                    });
                } finally {
                    setLoading(false);
                }
            }
        };

        fetchLatestSession();
    }, [user]);

    // Format date
    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-700 text-lg font-semibold">กำลังโหลดข้อมูล...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header */}
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/history')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <img src={derndeeLogo} alt="DernDee" className="h-8 sm:h-10 md:h-12 object-contain" />
                </div>
            </header>

            {/* Main Content */}
            <main className="p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8 pb-6 max-w-7xl mx-auto">
                {/* Title Card */}
                <div className="bg-gradient-to-br from-white via-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5 relative">
                    {/* <button
                        onClick={() => navigate('/home')}
                        className="absolute top-4 sm:top-5 md:top-6 left-4 sm:left-5 md:left-6 p-2 hover:bg-white/80 rounded-full transition-colors flex-shrink-0 z-10"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-gray-700" />
                    </button> */}
                    <div className="flex flex-col items-center text-center pt-8 sm:pt-10 md:pt-12">
                        <div className="mb-4 sm:mb-5">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-blue-100 border-4 border-white shadow-2xl flex items-center justify-center">
                                <TrendingUp className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 text-blue-600" />
                            </div>
                        </div>
                        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-800 mb-2">
                            Analysis Result
                        </h1>
                        <p className="text-base sm:text-lg md:text-xl text-gray-600">
                            ผลการวิเคราะห์การฝึกล่าสุด
                        </p>
                    </div>
                </div>

                {latestSession ? (
                    <>
                        {/* Session Date Card */}
                        <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <Calendar className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600 flex-shrink-0" />
                                <div>
                                    <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-800">
                                        วันที่ฝึก
                                    </h3>
                                    <p className="text-sm sm:text-base md:text-lg text-gray-600 mt-1">
                                        {formatDate(latestSession.createdAt || latestSession.date)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Gait Parameters Card */}
                        <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                            <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 md:mb-6 flex items-center gap-2">
                                <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                                Gait Parameters
                            </h3>

                            {/* Grid Layout - 2 columns */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                                {/* Cadence */}
                                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100 hover:border-blue-300 transition-colors">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                        <Footprints className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-blue-600 flex-shrink-0" />
                                        <label className="text-xs sm:text-sm md:text-base font-semibold text-gray-600">
                                            Cadence
                                        </label>
                                    </div>
                                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900">
                                        {latestSession.cadence || 110}
                                    </div>
                                    <div className="text-xs sm:text-sm md:text-base text-gray-600 font-medium mt-1 sm:mt-2">
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
                                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900">
                                        {(latestSession.stepLength || 0.75).toFixed(2)}
                                    </div>
                                    <div className="text-xs sm:text-sm md:text-base text-gray-600 font-medium mt-1 sm:mt-2">
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
                                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900">
                                        {(latestSession.strideLength || 1.5).toFixed(2)}
                                    </div>
                                    <div className="text-xs sm:text-sm md:text-base text-gray-600 font-medium mt-1 sm:mt-2">
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
                                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900">
                                        {(latestSession.walkingSpeed || 1.2).toFixed(1)}
                                    </div>
                                    <div className="text-xs sm:text-sm md:text-base text-gray-600 font-medium mt-1 sm:mt-2">
                                        m/s
                                    </div>
                                </div>

                                {/* Double Support Time */}
                                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100 hover:border-blue-300 transition-colors">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                        <Clock className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-blue-600 flex-shrink-0" />
                                        <label className="text-xs sm:text-sm md:text-base font-semibold text-gray-600">
                                            Double Support Time
                                        </label>
                                    </div>
                                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900">
                                        {latestSession.doubleSupportTime || 25}%
                                    </div>
                                    <div className="text-xs sm:text-sm md:text-base text-gray-600 font-medium mt-1 sm:mt-2">
                                        of gait cycle
                                    </div>
                                </div>

                                {/* Single Support Time */}
                                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100 hover:border-blue-300 transition-colors">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                        <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-blue-600 flex-shrink-0" />
                                        <label className="text-xs sm:text-sm md:text-base font-semibold text-gray-600">
                                            Single Support Time
                                        </label>
                                    </div>
                                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900">
                                        {latestSession.singleSupportTime || 40}%
                                    </div>
                                    <div className="text-xs sm:text-sm md:text-base text-gray-600 font-medium mt-1 sm:mt-2">
                                        of gait cycle
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Session Summary Card */}
                        <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                            <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                                <Clock className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                                Session Summary
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                                <div className="bg-blue-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-200">
                                    <div className="text-xs sm:text-sm md:text-base font-semibold text-gray-600 mb-2 sm:mb-3">
                                        Total Steps
                                    </div>
                                    <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-blue-600">
                                        {latestSession.totalSteps || latestSession.steps || 280}
                                    </div>
                                    <div className="text-xs sm:text-sm text-gray-600 font-medium mt-1 sm:mt-2">
                                        steps
                                    </div>
                                </div>
                                <div className="bg-blue-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-200">
                                    <div className="text-xs sm:text-sm md:text-base font-semibold text-gray-600 mb-2 sm:mb-3">
                                        Duration
                                    </div>
                                    <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-blue-600">
                                        {latestSession.duration || '05:00'}
                                    </div>
                                    <div className="text-xs sm:text-sm text-gray-600 font-medium mt-1 sm:mt-2">
                                        minutes
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    /* No Session Card */
                    <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-8 sm:p-10 md:p-12 lg:p-14 xl:p-16 mb-3 sm:mb-4 md:mb-5">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full bg-blue-100 border-4 border-white shadow-2xl flex items-center justify-center mb-6 sm:mb-8">
                                <Inbox className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-blue-600" />
                            </div>
                            <h3 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-800 mb-3 sm:mb-4">
                                ยังไม่มีข้อมูลการฝึก
                            </h3>
                            <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 sm:mb-8 max-w-md">
                                เริ่มต้นการเดินเพื่อดูผลการวิเคราะห์และติดตามความก้าวหน้าของคุณ
                            </p>
                            <button
                                onClick={() => navigate('/therapy')}
                                className="px-6 sm:px-8 md:px-10 lg:px-12 py-3 sm:py-4 md:py-5 rounded-xl sm:rounded-2xl text-sm sm:text-base md:text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg hover:shadow-xl"
                            >
                                เริ่มต้นการเดิน
                            </button>
                        </div>
                    </div>
                )}

                {/* Back Button */}
                <div className="flex justify-center mt-4 sm:mt-5 md:mt-6">
                    <button
                        onClick={() => navigate('/home')}
                        className="px-8 sm:px-10 md:px-12 py-3 sm:py-4 md:py-5 rounded-xl sm:rounded-2xl text-sm sm:text-base md:text-lg font-bold bg-gray-600 hover:bg-gray-700 text-white cursor-pointer hover:scale-105 transform transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                        กลับหน้าหลัก
                    </button>
                </div>
            </main>
        </div>
    );
};

export default AnalysisResult;

