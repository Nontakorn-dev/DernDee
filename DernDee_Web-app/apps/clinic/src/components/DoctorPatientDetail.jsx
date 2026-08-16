import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { fetchDoctorPatientDetail } from '@shared/services/sessionService.js';
import { 
    ArrowLeft,
    Calendar,
    Clock,
    FileText,
    CheckCircle2,
    AlertCircle,
    MessageCircle
} from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const SESSION_TONE_STYLES = {
    blue: {
        card: 'border-blue-200 bg-gradient-to-r from-blue-50 to-white hover:border-blue-300',
        badge: 'bg-blue-100 text-blue-700',
        metricCard: 'border-blue-100',
        icon: 'text-blue-600',
    },
    emerald: {
        card: 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-white hover:border-emerald-300',
        badge: 'bg-emerald-100 text-emerald-700',
        metricCard: 'border-emerald-100',
        icon: 'text-emerald-600',
    },
    amber: {
        card: 'border-amber-200 bg-gradient-to-r from-amber-50 to-white hover:border-amber-300',
        badge: 'bg-amber-100 text-amber-700',
        metricCard: 'border-amber-100',
        icon: 'text-amber-600',
    },
    violet: {
        card: 'border-violet-200 bg-gradient-to-r from-violet-50 to-white hover:border-violet-300',
        badge: 'bg-violet-100 text-violet-700',
        metricCard: 'border-violet-100',
        icon: 'text-violet-600',
    },
};

const getToneStyle = (tone) => SESSION_TONE_STYLES[tone] || SESSION_TONE_STYLES.blue;

const DoctorPatientDetail = () => {
    const navigate = useNavigate();
    const { patientId } = useParams();
    const { user } = useUserAuth();
    const [patient, setPatient] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPatientData = async () => {
            if (!user?.uid || !patientId) {
                setLoading(false);
                return;
            }

            try {
                const patientDetail = await fetchDoctorPatientDetail(user.uid, patientId);
                setPatient(patientDetail.patient);
                setSessions(patientDetail.sessions);
            } catch (error) {
                console.error("Error fetching patient data:", error);
                setPatient(null);
                setSessions([]);
            } finally {
                setLoading(false);
            }
        };

        fetchPatientData();
    }, [user?.uid, patientId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-700 text-lg font-semibold">Loading patient data...</p>
                </div>
            </div>
        );
    }

    if (!patient) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-bold text-gray-600">Patient not found</p>
                </div>
            </div>
        );
    }

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
            <main className="p-3 sm:p-4 lg:p-6 pb-6 max-w-7xl mx-auto">
                {/* Title Section */}
                <div className="mb-4 sm:mb-6">
                    <div className="flex items-center gap-2 sm:gap-3 mb-4">
                        <button
                            onClick={() => navigate('/')}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                        </button>
                        <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-gray-900 break-words">
                            Patient Details
                        </h1>
                        <button
                            type="button"
                            onClick={() => navigate(`/chat?patientId=${patient.id}`)}
                            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white shadow-md transition-all duration-300 hover:bg-blue-600 hover:shadow-lg"
                        >
                            <MessageCircle className="h-4 w-4" />
                            Message
                        </button>
                    </div>
                </div>

                {/* Patient Info Card */}
                <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                        <div>
                            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-4">
                                {patient.name}
                            </h2>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs sm:text-sm text-gray-500 mb-1">Patient ID</p>
                                    <p className="text-sm sm:text-base font-bold text-gray-900 font-mono">{patient.patientId}</p>
                                </div>
                                <div>
                                    <p className="text-xs sm:text-sm text-gray-500 mb-1">Email</p>
                                    <p className="text-sm sm:text-base font-bold text-gray-900">{patient.email}</p>
                                </div>
                                <div>
                                    <p className="text-xs sm:text-sm text-gray-500 mb-1">Phone</p>
                                    <p className="text-sm sm:text-base font-bold text-gray-900">{patient.phone}</p>
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs sm:text-sm text-gray-500 mb-1">Age / Gender</p>
                                    <p className="text-sm sm:text-base font-bold text-gray-900">{patient.age} years old, {patient.gender}</p>
                                </div>
                                <div>
                                    <p className="text-xs sm:text-sm text-gray-500 mb-1">Start Date</p>
                                    <p className="text-sm sm:text-base font-bold text-gray-900">{patient.startDate}</p>
                                </div>
                                <div>
                                    <p className="text-xs sm:text-sm text-gray-500 mb-1">Total Sessions</p>
                                    <p className="text-sm sm:text-base font-bold text-gray-900">{patient.totalSessions}</p>
                                </div>
                                <div>
                                    <p className="text-xs sm:text-sm text-gray-500 mb-1">Progress</p>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-200 rounded-full h-3">
                                            <div 
                                                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                                                style={{ width: `${patient.progress}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900">{patient.progress}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sessions List */}
                <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 border-2 border-gray-200">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold text-gray-900 mb-4 sm:mb-6">
                        Therapy Sessions
                    </h2>
                    {sessions.length === 0 ? (
                        <div className="text-center py-8">
                            <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                            <p className="text-lg font-bold text-gray-600">No sessions found</p>
                            <p className="text-sm text-gray-500 mt-2">This patient hasn&apos;t completed any therapy sessions yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-3 sm:space-y-4">
                            {sessions.map((session) => {
                                const toneStyle = getToneStyle(session.sessionTone);

                                return (
                                    <div
                                        key={session.id}
                                        onClick={() => navigate(`/patients/${patientId}/analysis/${session.id}`)}
                                        className={`p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer ${toneStyle.card}`}
                                    >
                                        <div className="flex flex-col gap-4">
                                            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                                                <div className="flex-1">
                                                    <div className="flex flex-wrap items-center gap-3 mb-2">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${toneStyle.badge}`}>
                                                            {session.sessionLabel}
                                                        </span>
                                                        <div className="flex items-center gap-2 text-gray-600">
                                                            <Calendar className={`w-4 h-4 ${toneStyle.icon}`} />
                                                            <span className="text-base sm:text-lg font-bold text-gray-900">{session.date}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-gray-500">
                                                            <Clock className="w-4 h-4" />
                                                            <span className="text-sm">{session.time}</span>
                                                        </div>
                                                        {session.status === 'pending' && (
                                                            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">
                                                                Review Needed
                                                            </span>
                                                        )}
                                                        {session.status === 'reviewed' && (
                                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                                                                <CheckCircle2 className="w-3 h-3" />
                                                                Reviewed
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-500">{session.sessionDescription}</p>
                                                </div>
                                                <div className="flex items-center gap-2 self-start lg:self-center">
                                                    <FileText className={`w-5 h-5 ${toneStyle.icon}`} />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                                                {session.cardMetrics.map((metric) => (
                                                    <div key={`${session.id}-${metric.label}`} className={`rounded-xl border bg-white p-3 ${toneStyle.metricCard}`}>
                                                        <p className="text-xs text-gray-500 mb-1">{metric.label}</p>
                                                        <p className="font-bold text-gray-900 text-sm sm:text-base">{metric.value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default DoctorPatientDetail;
