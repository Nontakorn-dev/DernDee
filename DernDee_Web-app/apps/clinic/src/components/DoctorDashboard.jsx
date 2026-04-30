import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import {
    createDoctorRealtimeSubscription,
    fetchDoctorDashboardData,
    removeRealtimeSubscription,
} from '@shared/services/sessionService.js';
import { 
    Users, 
    Activity, 
    TrendingUp, 
    Clock,
    AlertCircle,
    CheckCircle2,
    ArrowRight,
    Calendar,
    LogOut,
    MessageCircle
} from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const DoctorDashboard = () => {
    const navigate = useNavigate();
    const { user, logOut } = useUserAuth();
    const [stats, setStats] = useState({
        totalPatients: 0,
        activeSessions: 0,
        pendingReviews: 0,
        completedToday: 0
    });
    const [recentPatients, setRecentPatients] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        let realtimeChannel = null;

        const loadDashboard = async () => {
            if (!user?.uid) {
                if (isMounted) {
                    setLoading(false);
                }
                return;
            }

            try {
                const dashboardData = await fetchDoctorDashboardData(user.uid);

                if (!isMounted) {
                    return;
                }

                setStats(dashboardData.stats);
                setRecentPatients(dashboardData.recentPatients);
            } catch (error) {
                console.error("Error fetching dashboard data:", error);

                if (!isMounted) {
                    return;
                }

                setStats({
                    totalPatients: 0,
                    activeSessions: 0,
                    pendingReviews: 0,
                    completedToday: 0,
                });
                setRecentPatients([]);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void loadDashboard();

        if (user?.uid) {
            try {
                realtimeChannel = createDoctorRealtimeSubscription(() => {
                    void loadDashboard();
                });
            } catch (error) {
                console.error('Error subscribing to dashboard updates:', error);
            }
        }

        return () => {
            isMounted = false;
            void removeRealtimeSubscription(realtimeChannel);
        };
    }, [user?.uid]);

    const handleLogout = async () => {
        try {
            await logOut();
            window.location.assign('/login');
        } catch (error) {
            console.error("Error logging out:", error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-700 text-lg font-semibold">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 lg:px-8 py-5 sm:py-6 md:py-7 flex items-center justify-between h-20 sm:h-24 md:h-28">
                <div className="w-40 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 flex items-center justify-center">
                    <img 
                        src={derndeeLogo} 
                        alt="Derndee Logo" 
                        className="w-full h-full object-contain"
                    />
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="text-right">
                        <p className="text-sm sm:text-base font-bold text-gray-900">
                            {user?.displayName || 'Doctor'}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600">Medical Professional</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Logout"
                    >
                        <LogOut className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="p-3 sm:p-4 lg:p-6 pb-6 max-w-7xl mx-auto">
                {/* Title */}
                <div className="mb-4 sm:mb-6">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">
                        Doctor Dashboard
                    </h1>
                    <p className="text-sm sm:text-base text-gray-600 mt-2">
                        Monitor and review patient therapy progress
                    </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                    {/* Total Patients */}
                    <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 border-2 border-blue-200">
                        <div className="flex items-center justify-between mb-3">
                            <Users className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600" />
                        </div>
                        <p className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">
                            {stats.totalPatients}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">
                            Total Patients
                        </p>
                    </div>

                    {/* Active Sessions */}
                    <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 border-2 border-green-200">
                        <div className="flex items-center justify-between mb-3">
                            <Activity className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" />
                        </div>
                        <p className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">
                            {stats.activeSessions}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">
                            Active Sessions
                        </p>
                    </div>

                    {/* Pending Reviews */}
                    <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 border-2 border-yellow-200">
                        <div className="flex items-center justify-between mb-3">
                            <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-600" />
                        </div>
                        <p className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">
                            {stats.pendingReviews}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">
                            Pending Reviews
                        </p>
                    </div>

                    {/* Completed Today */}
                    <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 border-2 border-purple-200">
                        <div className="flex items-center justify-between mb-3">
                            <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-purple-600" />
                        </div>
                        <p className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">
                            {stats.completedToday}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">
                            Completed Today
                        </p>
                    </div>
                </div>

                {/* Recent Patients - Enhanced */}
                <div className="bg-gradient-to-br from-white via-blue-50 to-indigo-50 rounded-3xl shadow-2xl p-6 sm:p-8 border-2 border-blue-200">
                    <div className="flex items-center justify-between mb-6 sm:mb-8">
                        <div>
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 mb-2">
                                Recent Patients
                            </h2>
                            <p className="text-sm sm:text-base text-gray-600">
                                Monitor and review patient therapy progress
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                            <button
                                onClick={() => window.location.assign('/clinic/gait-dashboard/')}
                                className="px-4 sm:px-6 py-2 sm:py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold text-sm sm:text-base transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2"
                            >
                                <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span>Gait Dashboard</span>
                            </button>
                            <button
                                onClick={() => navigate('/chat')}
                                className="px-4 sm:px-6 py-2 sm:py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-sm sm:text-base transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2"
                            >
                                <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span>Messages</span>
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        {recentPatients.map((patient) => (
                            <div
                                key={patient.id}
                                onClick={() => navigate(`/patients/${patient.id}`)}
                                className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 border-2 border-gray-200 hover:border-blue-400 hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:scale-[1.02]"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                                {patient.name.split(' ').map(n => n[0]).join('')}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-lg sm:text-xl font-extrabold text-gray-900 truncate">
                                                    {patient.name}
                                                </h3>
                                                <p className="text-xs sm:text-sm text-gray-500 font-mono">
                                                    {patient.patientId}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    {patient.status === 'review' && (
                                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold border-2 border-yellow-300">
                                            Review
                                        </span>
                                    )}
                                    {patient.status === 'active' && (
                                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border-2 border-green-300">
                                            Active
                                        </span>
                                    )}
                                    {patient.status === 'completed' && (
                                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border-2 border-blue-300">
                                            Done
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="w-4 h-4 text-blue-600" />
                                        <span className="text-gray-700 font-semibold">Last Session:</span>
                                        <span className="text-gray-900 font-bold">{patient.lastSession}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                                            <div 
                                                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full transition-all duration-500"
                                                style={{ width: `${patient.progress}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-sm font-extrabold text-gray-900 min-w-[3rem] text-right">
                                            {patient.progress}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DoctorDashboard;
