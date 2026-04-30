import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUserAuth } from '../../../../src/context/UserAuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../../src/firebase';
import { getPatientById, getSessionById } from '../data/mockDoctorData';
import { 
    ArrowLeft,
    CheckCircle2,
    XCircle,
    FileText,
    Calendar,
    Clock,
    Footprints,
    TrendingUp,
    BarChart3,
    MessageCircle,
    Save
} from 'lucide-react';
import derndeeLogo from '../../../../src/assets/images/derndee-logo.png';

const DoctorAnalysisReview = () => {
    const navigate = useNavigate();
    const { patientId, sessionId } = useParams();
    const { user } = useUserAuth();
    const [session, setSession] = useState(null);
    const [patient, setPatient] = useState(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [reviewStatus, setReviewStatus] = useState('pending'); // 'pending', 'approved', 'needs_attention'
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (user && patientId && sessionId) {
                try {
                    // Fetch session and patient data
                    // In real implementation, fetch from Firebase
                    
                    // Use mock data
                    const patientData = getPatientById(patientId);
                    const sessionData = getSessionById(patientId, sessionId);
                    
                    if (patientData && sessionData) {
                        setPatient(patientData);
                        setSession(sessionData);
                        setReviewNotes(sessionData.reviewNotes || '');
                        setReviewStatus(sessionData.status || 'pending');
                    }
                } catch (error) {
                    console.error("Error fetching data:", error);
                } finally {
                    setLoading(false);
                }
            }
        };

        fetchData();
    }, [user, patientId, sessionId]);

    const handleSaveReview = async () => {
        setSaving(true);
        try {
            // In real implementation, save to Firebase
            // await updateDoc(doc(db, 'walkSessions', sessionId), {
            //     status: reviewStatus,
            //     reviewNotes: reviewNotes,
            //     reviewedBy: user.uid,
            //     reviewedAt: serverTimestamp()
            // });
            
            // Simulate save
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            alert('Review saved successfully!');
            navigate(`/patients/${patientId}`);
        } catch (error) {
            console.error("Error saving review:", error);
            alert('Error saving review. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-700 text-lg font-semibold">Loading analysis...</p>
                </div>
            </div>
        );
    }

    if (!session || !patient) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="text-center">
                    <XCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-bold text-gray-600">Session not found</p>
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
                            onClick={() => navigate(`/patients/${patientId}`)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-gray-900 break-words">
                                Analysis Review
                            </h1>
                            <p className="text-sm sm:text-base text-gray-600 mt-1">
                                {patient.name} - {patient.patientId}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Session Info */}
                <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-gray-200">
                    <div className="flex items-center gap-3 mb-4">
                        <Calendar className="w-6 h-6 text-blue-600" />
                        <div>
                            <p className="text-base sm:text-lg font-bold text-gray-900">{session.date}</p>
                            <p className="text-sm text-gray-600">{session.time}</p>
                        </div>
                    </div>
                </div>

                {/* Gait Parameters */}
                <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-gray-200">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 text-blue-600" />
                        Gait Parameters
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
                        <div className="bg-gray-50 rounded-2xl p-4 border-2 border-blue-100">
                            <div className="flex items-center gap-2 mb-2">
                                <Footprints className="w-5 h-5 text-blue-600" />
                                <label className="text-xs sm:text-sm font-semibold text-gray-600">Cadence</label>
                            </div>
                            <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">
                                {session.cadence}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-600 font-medium mt-1">steps/min</div>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-4 border-2 border-green-100">
                            <div className="flex items-center gap-2 mb-2">
                                <BarChart3 className="w-5 h-5 text-green-600" />
                                <label className="text-xs sm:text-sm font-semibold text-gray-600">Step Length</label>
                            </div>
                            <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">
                                {session.stepLength}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-600 font-medium mt-1">meters</div>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-4 border-2 border-purple-100">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp className="w-5 h-5 text-purple-600" />
                                <label className="text-xs sm:text-sm font-semibold text-gray-600">Stride Length</label>
                            </div>
                            <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">
                                {session.strideLength}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-600 font-medium mt-1">meters</div>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-4 border-2 border-orange-100">
                            <div className="flex items-center gap-2 mb-2">
                                <BarChart3 className="w-5 h-5 text-orange-600" />
                                <label className="text-xs sm:text-sm font-semibold text-gray-600">Walking Speed</label>
                            </div>
                            <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">
                                {session.walkingSpeed}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-600 font-medium mt-1">m/s</div>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-4 border-2 border-red-100">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock className="w-5 h-5 text-red-600" />
                                <label className="text-xs sm:text-sm font-semibold text-gray-600">Duration</label>
                            </div>
                            <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">
                                {session.duration}
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-4 border-2 border-indigo-100">
                            <div className="flex items-center gap-2 mb-2">
                                <Footprints className="w-5 h-5 text-indigo-600" />
                                <label className="text-xs sm:text-sm font-semibold text-gray-600">Total Steps</label>
                            </div>
                            <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">
                                {session.totalSteps}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Review Section */}
                <div className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-gray-200">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        Review & Notes
                    </h2>
                    
                    {/* Status Selection */}
                    <div className="mb-4 sm:mb-6">
                        <label className="block text-sm sm:text-base font-bold text-gray-700 mb-3">Review Status</label>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => setReviewStatus('approved')}
                                className={`px-6 py-3 rounded-xl font-bold text-sm sm:text-base transition-all duration-300 border-2 flex items-center gap-2 ${
                                    reviewStatus === 'approved'
                                        ? 'bg-green-500 text-white border-green-500'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-green-300'
                                }`}
                            >
                                <CheckCircle2 className="w-5 h-5" />
                                Approved
                            </button>
                            <button
                                onClick={() => setReviewStatus('needs_attention')}
                                className={`px-6 py-3 rounded-xl font-bold text-sm sm:text-base transition-all duration-300 border-2 flex items-center gap-2 ${
                                    reviewStatus === 'needs_attention'
                                        ? 'bg-yellow-500 text-white border-yellow-500'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-yellow-300'
                                }`}
                            >
                                <XCircle className="w-5 h-5" />
                                Needs Attention
                            </button>
                            <button
                                onClick={() => setReviewStatus('pending')}
                                className={`px-6 py-3 rounded-xl font-bold text-sm sm:text-base transition-all duration-300 border-2 flex items-center gap-2 ${
                                    reviewStatus === 'pending'
                                        ? 'bg-gray-500 text-white border-gray-500'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <Clock className="w-5 h-5" />
                                Pending
                            </button>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="mb-4 sm:mb-6">
                        <label className="block text-sm sm:text-base font-bold text-gray-700 mb-3">Review Notes</label>
                        <textarea
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Enter your review notes and recommendations..."
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm sm:text-base min-h-[150px]"
                        />
                    </div>

                    {/* Save Button */}
                    <button
                        onClick={handleSaveReview}
                        disabled={saving}
                        className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-extrabold text-sm sm:text-base transition-all duration-300 shadow-lg hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        <span>{saving ? 'Saving...' : 'Save Review'}</span>
                    </button>
                </div>
            </main>
        </div>
    );
};

export default DoctorAnalysisReview;
