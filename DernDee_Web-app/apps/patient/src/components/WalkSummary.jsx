import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { COACH_MODES } from '@shared/coach/coachConfig.js';
import { fetchCoachSessionRecap } from '@shared/coach/geminiCoachApi.js';
import { fetchLatestPatientSession, fetchPatientSessionById } from '@shared/services/sessionService.js';
import { formatAppDate, normalizeUserPreferences } from '@shared/services/userPreferences.js';
import { Footprints, Gauge, TrendingUp, Clock, Zap, MessageCircle, Inbox, Calendar } from 'lucide-react';
import stepdeeLogo from '@shared/assets/images/stepdee-logo.png';

function hasLiveSummaryState(state) {
    return Boolean(
        state
        && (state.sessionSummary || Number.isFinite(Number(state.cadence)) || Number.isFinite(Number(state.steps)) || Number.isFinite(Number(state.totalSteps))),
    );
}

function mapPersistedSession(session) {
    if (!session) {
        return null;
    }

    return {
        id: session.id,
        sessionLabel: session.sessionLabel || 'Therapy Session',
        date: session.date || session.createdAt || session.startTime,
        cadence: Number(session.cadence || 0),
        stepLength: Number(session.stepLength || 0),
        strideLength: Number(session.strideLength || 0),
        walkingSpeed: Number(session.walkingSpeed || 0),
        clearance: Number(session.clearance || 0),
        duration: session.duration || '00:00',
        totalSteps: Number(session.totalSteps || session.steps || 0),
        coachRecap: session.details?.coach_summary_text || '',
        source: 'history',
    };
}

function mapLiveSummaryState(state) {
    return {
        id: null,
        sessionLabel: 'Free Walk',
        date: new Date(),
        cadence: Math.round(Number(state.cadence || 0)),
        stepLength: Number(state.stepLength || 0),
        strideLength: Number(state.strideLength || 0),
        walkingSpeed: Number(state.walkingSpeed || 0),
        clearance: Number(state.clearance || 0),
        duration: state.duration || '00:00',
        totalSteps: Number(state.steps || state.totalSteps || 0),
        coachRecap: state.coachRecap || '',
        coachMode: state.coachMode,
        sessionSummary: state.sessionSummary,
        source: 'live',
    };
}

const WalkSummary = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { user, profile } = useUserAuth();
    const preferences = normalizeUserPreferences(profile?.preferences);
    const requestedSessionId = searchParams.get('sessionId') || location.state?.session?.id || null;
    const cameFromHistory = Boolean(searchParams.get('sessionId') || location.state?.session);

    const [sessionData, setSessionData] = useState(() => (
        hasLiveSummaryState(location.state) ? mapLiveSummaryState(location.state) : mapPersistedSession(location.state?.session)
    ));
    const [coachRecap, setCoachRecap] = useState(location.state?.coachRecap || location.state?.session?.details?.coach_summary_text || '');
    const [coachRecapLoading, setCoachRecapLoading] = useState(false);
    const [loading, setLoading] = useState(!hasLiveSummaryState(location.state) && !location.state?.session);
    const [error, setError] = useState('');

    useEffect(() => {
        if (hasLiveSummaryState(location.state)) {
            setSessionData(mapLiveSummaryState(location.state));
            setCoachRecap(location.state.coachRecap || '');
            setLoading(false);
            return;
        }

        let cancelled = false;

        const loadSession = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }

            setLoading(true);
            setError('');

            try {
                const session = requestedSessionId
                    ? await fetchPatientSessionById(user.uid, requestedSessionId)
                    : await fetchLatestPatientSession(user.uid);

                if (cancelled) {
                    return;
                }

                const mapped = mapPersistedSession(session);
                setSessionData(mapped);
                setCoachRecap(mapped?.coachRecap || '');
            } catch (loadError) {
                console.error('Failed to load session summary:', loadError);
                if (!cancelled) {
                    setSessionData(null);
                    setError(loadError.message || 'Failed to load session');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadSession();

        return () => {
            cancelled = true;
        };
    }, [location.state, requestedSessionId, user?.uid]);

    useEffect(() => {
        if (coachRecap || sessionData?.source !== 'live' || sessionData?.coachMode !== COACH_MODES.LIVE || !sessionData?.sessionSummary) {
            return;
        }

        let cancelled = false;
        setCoachRecapLoading(true);

        void fetchCoachSessionRecap(sessionData.sessionSummary, sessionData.duration)
            .then((payload) => {
                if (!cancelled && payload?.recapText) {
                    setCoachRecap(payload.recapText);
                }
            })
            .catch((recapError) => {
                console.warn('Failed to load coach recap:', recapError);
            })
            .finally(() => {
                if (!cancelled) {
                    setCoachRecapLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [coachRecap, sessionData]);

    const backPath = cameFromHistory ? '/history' : '/home';
    const dateLabel = useMemo(
        () => formatAppDate(sessionData?.date, preferences.language),
        [preferences.language, sessionData?.date],
    );

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
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <img src={stepdeeLogo} alt="StepDee" className="h-10 sm:h-12 object-contain" />
                </div>
                <div className="w-10"></div>
            </header>

            <main className="p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8 pb-6 max-w-7xl mx-auto">
                {error && (
                    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                        {error}
                    </div>
                )}

                {!sessionData ? (
                    <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-8 sm:p-12">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 rounded-full bg-blue-100 border-4 border-white shadow-2xl flex items-center justify-center mb-6">
                                <Inbox className="w-12 h-12 text-blue-600" />
                            </div>
                            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3">ยังไม่มีข้อมูลการฝึก</h3>
                            <p className="text-base text-gray-600 mb-6 max-w-md">
                                เริ่มต้นการเดินเพื่อดูผลการวิเคราะห์และติดตามความก้าวหน้าของคุณ
                            </p>
                            <button
                                onClick={() => navigate('/therapy')}
                                className="px-8 py-3 rounded-2xl text-base font-bold bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                เริ่มต้นการเดิน
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {(sessionData.sessionLabel || dateLabel) && (
                            <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 mb-4">
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-6 h-6 text-blue-600 flex-shrink-0" />
                                    <div>
                                        <h3 className="text-base sm:text-lg font-bold text-gray-800">
                                            {sessionData.sessionLabel}
                                        </h3>
                                        {dateLabel && (
                                            <p className="text-sm text-gray-600 mt-1">{dateLabel}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                            <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold text-gray-800 mb-4 sm:mb-5 md:mb-6 flex items-center gap-2">
                                <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                                Gait Parameters
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                        <Footprints className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
                                        <label className="text-xs sm:text-sm font-semibold text-gray-600">Cadence</label>
                                    </div>
                                    <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">{sessionData.cadence || 0}</div>
                                    <div className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">steps/min</div>
                                </div>

                                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                        <Footprints className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
                                        <label className="text-xs sm:text-sm font-semibold text-gray-600">Step Length</label>
                                    </div>
                                    <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">{sessionData.stepLength.toFixed(2)}</div>
                                    <div className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">m</div>
                                </div>

                                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                        <Footprints className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
                                        <label className="text-xs sm:text-sm font-semibold text-gray-600">Stride Length</label>
                                    </div>
                                    <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">{sessionData.strideLength.toFixed(2)}</div>
                                    <div className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">m</div>
                                </div>

                                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                        <Gauge className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 flex-shrink-0" />
                                        <label className="text-xs sm:text-sm font-semibold text-gray-600">Walking Speed</label>
                                    </div>
                                    <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">{sessionData.walkingSpeed.toFixed(2)}</div>
                                    <div className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">m/s</div>
                                </div>

                                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-100 sm:col-span-2">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                        <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 flex-shrink-0" />
                                        <label className="text-xs sm:text-sm font-semibold text-gray-600">Foot Clearance (Avg)</label>
                                    </div>
                                    <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">{(sessionData.clearance * 100).toFixed(1)} cm</div>
                                    <div className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">max toe height during swing</div>
                                </div>
                            </div>
                        </div>

                        {(coachRecap || coachRecapLoading) && (
                            <div className="bg-gradient-to-br from-violet-50 to-blue-50 border-2 border-violet-200 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 mb-4">
                                <h3 className="text-lg sm:text-xl font-extrabold text-gray-800 mb-3 flex items-center gap-2">
                                    <MessageCircle className="w-6 h-6 text-violet-600" />
                                    AI Coach Recap
                                </h3>
                                <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
                                    {coachRecapLoading ? 'กำลังสรุปผลการเดิน...' : coachRecap}
                                </p>
                            </div>
                        )}

                        <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                            <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                                <Clock className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                                Session Summary
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                                <div className="bg-blue-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-200">
                                    <div className="text-xs sm:text-sm font-semibold text-gray-600 mb-2">Total Steps</div>
                                    <div className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-blue-600">{sessionData.totalSteps}</div>
                                    <div className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">steps</div>
                                </div>
                                <div className="bg-blue-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border-2 border-blue-200">
                                    <div className="text-xs sm:text-sm font-semibold text-gray-600 mb-2">Duration</div>
                                    <div className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-blue-600">{sessionData.duration}</div>
                                    <div className="text-xs sm:text-sm text-gray-600 font-semibold mt-1">minutes</div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 md:gap-5">
                    <button
                        onClick={() => navigate(backPath)}
                        className="flex-1 py-3 sm:py-4 rounded-2xl text-base sm:text-lg font-extrabold bg-blue-500 hover:bg-blue-600 text-white"
                    >
                        {cameFromHistory ? 'Back to History' : 'Back to Home'}
                    </button>
                    <button
                        onClick={() => navigate('/therapy')}
                        className="flex-1 py-3 sm:py-4 rounded-2xl text-base sm:text-lg font-extrabold bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                        Walk Again
                    </button>
                </div>
            </main>
        </div>
    );
};

export default WalkSummary;
