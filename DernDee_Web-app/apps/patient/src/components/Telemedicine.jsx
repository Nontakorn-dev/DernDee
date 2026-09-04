import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Send,
    Paperclip,
    FileText,
    X,
    Calendar,
    Copy,
    Check,
    MessageCircle,
    AlertCircle,
} from 'lucide-react';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { fetchPatientHistorySessions } from '@shared/services/sessionService.js';
import { normalizeUserPreferences } from '@shared/services/userPreferences.js';
import {
    buildAnalysisPayload,
    fetchAssignedDoctorProfiles,
    fetchChatMessages,
    formatAnalysisMessageBody,
    formatChatTime,
    getOrCreateChatThread,
    getProfileInitials,
    markChatThreadRead,
    removeChatSubscription,
    sendChatMessage,
    subscribeToChatThread,
} from '@shared/services/chatService.js';
import stepdeeLogo from '@shared/assets/images/stepdee-logo.png';

const Telemedicine = () => {
    const navigate = useNavigate();
    const { user, profile } = useUserAuth();
    const canShareAnalysis = normalizeUserPreferences(profile?.preferences).dataSharing;
    const messagesEndRef = useRef(null);
    const [message, setMessage] = useState('');
    const [showAnalysisResults, setShowAnalysisResults] = useState(false);
    const [doctors, setDoctors] = useState([]);
    const [selectedDoctorId, setSelectedDoctorId] = useState(null);
    const [thread, setThread] = useState(null);
    const [messages, setMessages] = useState([]);
    const [analysisResults, setAnalysisResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [copiedPatientId, setCopiedPatientId] = useState(false);

    const selectedDoctor = useMemo(
        () => doctors.find((doctor) => doctor.id === selectedDoctorId) || null,
        [doctors, selectedDoctorId],
    );

    const appendMessage = useCallback((incoming) => {
        setMessages((current) => (
            current.some((item) => item.id === incoming.id)
                ? current
                : [...current, incoming]
        ));
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadDoctors = async () => {
            if (!user?.uid) {
                if (isMounted) {
                    setLoading(false);
                }
                return;
            }

            try {
                const [assignedDoctors, sessions] = await Promise.all([
                    fetchAssignedDoctorProfiles(user.uid),
                    fetchPatientHistorySessions(user.uid).catch(() => []),
                ]);

                if (!isMounted) {
                    return;
                }

                setDoctors(assignedDoctors);
                setSelectedDoctorId((current) => current || assignedDoctors[0]?.id || null);
                setAnalysisResults(sessions.slice(0, 12));
                setError('');
            } catch (loadError) {
                console.error('Error loading telemedicine doctors:', loadError);
                if (isMounted) {
                    setError(loadError.message || 'Failed to load telemedicine chat');
                    setDoctors([]);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void loadDoctors();

        return () => {
            isMounted = false;
        };
    }, [user?.uid]);

    useEffect(() => {
        let isMounted = true;
        let channel = null;

        const openThread = async () => {
            if (!user?.uid || !selectedDoctorId) {
                setThread(null);
                setMessages([]);
                return;
            }

            try {
                const nextThread = await getOrCreateChatThread({
                    doctorId: selectedDoctorId,
                    patientId: user.uid,
                });

                if (!isMounted) {
                    return;
                }

                setThread(nextThread);
                const nextMessages = await fetchChatMessages(nextThread.id);
                if (!isMounted) {
                    return;
                }

                setMessages(nextMessages);
                await markChatThreadRead(nextThread.id).catch(() => null);

                channel = subscribeToChatThread(nextThread.id, {
                    onMessage: (incoming) => {
                        if (!isMounted) {
                            return;
                        }

                        appendMessage(incoming);
                        if (incoming.senderId !== user.uid) {
                            void markChatThreadRead(nextThread.id).catch(() => null);
                        }
                    },
                });
                setError('');
            } catch (openError) {
                console.error('Error opening telemedicine thread:', openError);
                if (isMounted) {
                    setThread(null);
                    setMessages([]);
                    setError(openError.message || 'Failed to open this conversation');
                }
            }
        };

        void openThread();

        return () => {
            isMounted = false;
            void removeChatSubscription(channel);
        };
    }, [appendMessage, selectedDoctorId, user?.uid]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleCopyPatientId = async () => {
        if (!user?.uid) {
            return;
        }

        try {
            await navigator.clipboard.writeText(user.uid);
            setCopiedPatientId(true);
            window.setTimeout(() => setCopiedPatientId(false), 2000);
        } catch (copyError) {
            console.error('Error copying patient ID:', copyError);
        }
    };

    const handleSendMessage = async () => {
        const text = message.trim();
        if (!text || !thread || !user?.uid || sending) {
            return;
        }

        setSending(true);
        setError('');

        try {
            const sent = await sendChatMessage({
                threadId: thread.id,
                senderId: user.uid,
                senderRole: 'patient',
                body: text,
            });
            appendMessage(sent);
            setMessage('');
        } catch (sendError) {
            console.error('Error sending telemedicine message:', sendError);
            setError(sendError.message || 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const handleSendAnalysisResult = async (session) => {
        if (!canShareAnalysis) {
            setError('Turn on “Share data with my doctor” in Settings before attaching a session.');
            return;
        }

        if (!thread || !user?.uid || sending) {
            return;
        }

        setSending(true);
        setError('');

        try {
            const sent = await sendChatMessage({
                threadId: thread.id,
                senderId: user.uid,
                senderRole: 'patient',
                body: formatAnalysisMessageBody(session),
                messageType: 'analysis',
                payload: buildAnalysisPayload(session),
            });
            appendMessage(sent);
            setShowAnalysisResults(false);
        } catch (sendError) {
            console.error('Error sending analysis result:', sendError);
            setError(sendError.message || 'Failed to send analysis result');
        } finally {
            setSending(false);
        }
    };

    const renderAnalysisCard = (msg, isOwn) => {
        const analysis = msg.analysisData || {};
        const dateLabel = analysis.date
            ? new Date(analysis.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Session';

        return (
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    <span className="font-bold text-sm">{analysis.sessionLabel || 'Analysis Result'}</span>
                </div>
                <div className="text-sm space-y-1">
                    <p className="font-semibold">{dateLabel}</p>
                    <p>Cadence: {analysis.cadence || 0} steps/min</p>
                    <p>Step Length: {Number(analysis.stepLength || 0).toFixed(2)} m</p>
                    <p>Stride Length: {Number(analysis.strideLength || 0).toFixed(2)} m</p>
                    <p>Walking Speed: {Number(analysis.walkingSpeed || 0).toFixed(2)} m/s</p>
                    <p>Duration: {analysis.duration || '-'}</p>
                    <p>Total Steps: {analysis.totalSteps || 0}</p>
                </div>
                <p className={`text-xs mt-2 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                    {formatChatTime(msg.timestamp)}
                </p>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-700 text-lg font-semibold">Loading telemedicine...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex flex-col">
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/home')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <img src={stepdeeLogo} alt="StepDee" className="h-8 sm:h-10 md:h-12 object-contain" />
                </div>
            </header>

            <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full p-3 sm:p-4 lg:p-6 min-h-0">
                {!selectedDoctor ? (
                    <div className="flex-1 bg-white rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center">
                        <MessageCircle className="w-16 h-16 text-blue-400 mb-4" />
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">No doctor linked yet</h1>
                        <p className="mt-3 max-w-xl text-sm sm:text-base text-gray-600">
                            Ask your doctor to add this Patient User ID on the Doctor Dashboard. After they link it, this chat will open the same conversation they see in Messages.
                        </p>
                        <div className="mt-6 w-full max-w-xl rounded-2xl bg-blue-50 px-4 py-4 text-left ring-1 ring-blue-100">
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600">Patient User ID</p>
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="break-all font-mono text-sm text-gray-800 sm:text-base">{user?.uid || '-'}</p>
                                <button
                                    type="button"
                                    onClick={handleCopyPatientId}
                                    className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                                >
                                    {copiedPatientId ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    <span>{copiedPatientId ? 'Copied' : 'Copy ID'}</span>
                                </button>
                            </div>
                        </div>
                        {error && (
                            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                                {error}
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="bg-white rounded-3xl shadow-2xl p-3 sm:p-4 mb-2 sm:mb-3 flex-shrink-0">
                            <div className="flex items-center justify-between gap-3 sm:gap-4">
                                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                                    {selectedDoctor.avatarUrl ? (
                                        <img
                                            src={selectedDoctor.avatarUrl}
                                            alt={selectedDoctor.name}
                                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg sm:text-xl flex-shrink-0">
                                            {getProfileInitials(selectedDoctor.name)}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold text-gray-900 tracking-tight truncate">
                                            {selectedDoctor.name}
                                        </h1>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            <span className="text-xs sm:text-sm font-semibold text-gray-600">Linked doctor</span>
                                            <span className="text-xs sm:text-sm text-gray-500">•</span>
                                            <span className="text-xs sm:text-sm font-semibold text-blue-600">
                                                Physical Therapy
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {doctors.length > 1 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {doctors.map((doctor) => (
                                        <button
                                            key={doctor.id}
                                            type="button"
                                            onClick={() => setSelectedDoctorId(doctor.id)}
                                            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                                                doctor.id === selectedDoctorId
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                            }`}
                                        >
                                            {doctor.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 bg-white rounded-3xl shadow-2xl p-4 sm:p-6 overflow-hidden flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                                {messages.length === 0 ? (
                                    <div className="h-full min-h-[12rem] flex flex-col items-center justify-center text-center px-4">
                                        <MessageCircle className="w-12 h-12 text-gray-300 mb-3" />
                                        <p className="text-base font-bold text-gray-600">No messages yet</p>
                                        <p className="text-sm text-gray-500 mt-1">Send a message and your doctor will see it in the clinic dashboard.</p>
                                    </div>
                                ) : (
                                    messages.map((msg) => {
                                        const isOwn = msg.senderId === user?.uid;
                                        return (
                                            <div
                                                key={msg.id}
                                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div className={`max-w-[80%] sm:max-w-[70%] md:max-w-[60%] ${isOwn
                                                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl rounded-tr-sm'
                                                    : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm'
                                                } p-3 sm:p-4 shadow-lg`}>
                                                    {msg.isAnalysisResult ? (
                                                        renderAnalysisCard(msg, isOwn)
                                                    ) : (
                                                        <>
                                                            <p className="text-sm sm:text-base whitespace-pre-wrap">{msg.text}</p>
                                                            <p className={`text-xs mt-2 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                                                                {formatChatTime(msg.timestamp)}
                                                            </p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="flex-shrink-0">
                                {error && (
                                    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                {showAnalysisResults && (
                                    <div className="mb-3 bg-gray-50 rounded-2xl border-2 border-blue-200 p-4 max-h-64 overflow-y-auto">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm sm:text-base font-bold text-gray-900">Select Analysis Result</h3>
                                            <button
                                                onClick={() => setShowAnalysisResults(false)}
                                                className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                                            >
                                                <X className="w-4 h-4 text-gray-600" />
                                            </button>
                                        </div>
                                        {analysisResults.length === 0 ? (
                                            <p className="text-sm text-gray-500">No saved sessions yet. Finish a walk first, then share it here.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {analysisResults.map((result) => (
                                                    <button
                                                        key={result.id}
                                                        onClick={() => handleSendAnalysisResult(result)}
                                                        className="w-full text-left p-3 bg-white rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <Calendar className="w-4 h-4 text-blue-500" />
                                                                <span className="font-semibold text-sm text-gray-900">
                                                                    {result.sessionLabel} • {result.date instanceof Date
                                                                        ? result.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                                        : result.date}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-gray-600">
                                                                {result.totalSteps} steps • {result.duration}
                                                            </div>
                                                        </div>
                                                        <div className="mt-2 text-xs text-gray-600">
                                                            Cadence: {result.cadence} • Speed: {result.walkingSpeed} m/s
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-end gap-2">
                                    <button
                                        onClick={() => {
                                            if (!canShareAnalysis) {
                                                setError('Turn on “Share data with my doctor” in Settings before attaching a session.');
                                                return;
                                            }
                                            setShowAnalysisResults(!showAnalysisResults);
                                        }}
                                        className="p-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex-shrink-0"
                                        title={canShareAnalysis ? 'Send Analysis Result' : 'Enable data sharing in Settings'}
                                    >
                                        <Paperclip className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </button>
                                    <div className="flex-1 relative">
                                        <input
                                            type="text"
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    void handleSendMessage();
                                                }
                                            }}
                                            placeholder="Type your message..."
                                            disabled={!thread || sending}
                                            className="w-full px-4 py-3 sm:py-4 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm sm:text-base pr-12 disabled:bg-gray-50"
                                        />
                                    </div>
                                    <button
                                        onClick={() => void handleSendMessage()}
                                        disabled={!message.trim() || !thread || sending}
                                        className="p-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                    >
                                        <Send className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};

export default Telemedicine;
