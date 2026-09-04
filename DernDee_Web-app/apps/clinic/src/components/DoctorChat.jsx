import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import {
    ArrowLeft,
    Send,
    Search,
    MessageCircle,
    FileText,
    AlertCircle,
} from 'lucide-react';
import {
    fetchChatMessages,
    fetchDoctorChatInbox,
    formatChatTime,
    getOrCreateChatThread,
    getProfileInitials,
    markChatThreadRead,
    removeChatSubscription,
    sendChatMessage,
    subscribeToChatThread,
    subscribeToDoctorInbox,
} from '@shared/services/chatService.js';
import stepdeeLogo from '@shared/assets/images/stepdee-logo.png';

const DoctorChat = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useUserAuth();
    const messagesEndRef = useRef(null);
    const requestedPatientId = searchParams.get('patientId');
    const [searchQuery, setSearchQuery] = useState('');
    const [inbox, setInbox] = useState([]);
    const [selectedPatientId, setSelectedPatientId] = useState(requestedPatientId);
    const [thread, setThread] = useState(null);
    const [currentMessages, setCurrentMessages] = useState([]);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    const selectedPatient = useMemo(
        () => inbox.find((patient) => patient.id === selectedPatientId) || null,
        [inbox, selectedPatientId],
    );

    const filteredPatients = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) {
            return inbox;
        }

        return inbox.filter((patient) => (
            patient.name.toLowerCase().includes(query)
            || String(patient.patientId || '').toLowerCase().includes(query)
            || String(patient.id || '').toLowerCase().includes(query)
        ));
    }, [inbox, searchQuery]);

    const appendMessage = useCallback((incoming) => {
        setCurrentMessages((current) => (
            current.some((item) => item.id === incoming.id)
                ? current
                : [...current, incoming]
        ));
    }, []);

    const loadInbox = useCallback(async () => {
        if (!user?.uid) {
            return [];
        }

        const nextInbox = await fetchDoctorChatInbox(user.uid);
        setInbox(nextInbox);
        return nextInbox;
    }, [user?.uid]);

    useEffect(() => {
        let isMounted = true;
        let inboxChannel = null;

        const bootstrap = async () => {
            if (!user?.uid) {
                if (isMounted) {
                    setLoading(false);
                }
                return;
            }

            try {
                const nextInbox = await loadInbox();
                if (!isMounted) {
                    return;
                }

                setSelectedPatientId((current) => {
                    if (current && nextInbox.some((patient) => patient.id === current)) {
                        return current;
                    }

                    if (requestedPatientId && nextInbox.some((patient) => patient.id === requestedPatientId)) {
                        return requestedPatientId;
                    }

                    return nextInbox[0]?.id || null;
                });
                setError('');
            } catch (loadError) {
                console.error('Error loading doctor inbox:', loadError);
                if (isMounted) {
                    setInbox([]);
                    setError(loadError.message || 'Failed to load patient messages');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void bootstrap();

        if (user?.uid) {
            inboxChannel = subscribeToDoctorInbox(user.uid, () => {
                void loadInbox().catch((inboxError) => {
                    console.error('Error refreshing doctor inbox:', inboxError);
                });
            });
        }

        return () => {
            isMounted = false;
            void removeChatSubscription(inboxChannel);
        };
    }, [loadInbox, requestedPatientId, user?.uid]);

    useEffect(() => {
        let isMounted = true;
        let channel = null;

        const openThread = async () => {
            if (!user?.uid || !selectedPatientId) {
                setThread(null);
                setCurrentMessages([]);
                return;
            }

            try {
                const nextThread = await getOrCreateChatThread({
                    doctorId: user.uid,
                    patientId: selectedPatientId,
                });

                if (!isMounted) {
                    return;
                }

                setThread(nextThread);
                const nextMessages = await fetchChatMessages(nextThread.id);
                if (!isMounted) {
                    return;
                }

                setCurrentMessages(nextMessages);
                await markChatThreadRead(nextThread.id).catch(() => null);
                void loadInbox().catch(() => null);

                channel = subscribeToChatThread(nextThread.id, {
                    onMessage: (incoming) => {
                        if (!isMounted) {
                            return;
                        }

                        appendMessage(incoming);
                        if (incoming.senderId !== user.uid) {
                            void markChatThreadRead(nextThread.id).catch(() => null);
                        }
                        void loadInbox().catch(() => null);
                    },
                });
                setError('');
            } catch (openError) {
                console.error('Error opening doctor chat thread:', openError);
                if (isMounted) {
                    setThread(null);
                    setCurrentMessages([]);
                    setError(openError.message || 'Failed to open this conversation');
                }
            }
        };

        void openThread();

        return () => {
            isMounted = false;
            void removeChatSubscription(channel);
        };
    }, [appendMessage, loadInbox, selectedPatientId, user?.uid]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages]);

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
                senderRole: 'doctor',
                body: text,
            });
            appendMessage(sent);
            setMessage('');
            void loadInbox().catch(() => null);
        } catch (sendError) {
            console.error('Error sending doctor chat message:', sendError);
            setError(sendError.message || 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const renderMessage = (msg) => {
        const isOwn = msg.senderId === user?.uid;
        const analysis = msg.analysisData || {};
        const dateLabel = analysis.date
            ? new Date(analysis.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Session';

        return (
            <div
                key={msg.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
            >
                <div className={`max-w-[80%] sm:max-w-[70%] ${
                    isOwn
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl rounded-tr-sm'
                        : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm'
                } p-3 sm:p-4 shadow-lg`}>
                    {msg.isAnalysisResult ? (
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
                            {analysis.sessionId && selectedPatient && (
                                <button
                                    type="button"
                                    onClick={() => navigate(`/patients/${selectedPatient.id}/analysis/${analysis.sessionId}`)}
                                    className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-bold ${
                                        isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                    }`}
                                >
                                    Open session
                                </button>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm sm:text-base whitespace-pre-wrap">{msg.text}</p>
                    )}
                    <p className={`text-xs mt-2 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                        {formatChatTime(msg.timestamp)}
                    </p>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-700 text-lg font-semibold">Loading patient messages...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex flex-col">
            <header className="bg-white shadow-xl px-4 sm:px-6 lg:px-8 py-5 sm:py-6 md:py-7 flex items-center justify-start h-20 sm:h-24 md:h-28 flex-shrink-0">
                <div className="w-40 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 flex items-center justify-center">
                    <img
                        src={stepdeeLogo}
                        alt="StepDee Logo"
                        className="w-full h-full object-contain"
                    />
                </div>
            </header>

            <main className="flex-1 flex flex-col w-full p-3 sm:p-4 lg:p-6 min-h-0 overflow-hidden">
                <div className="mb-3 sm:mb-4 flex-shrink-0">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <button
                            onClick={() => navigate('/')}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                        </button>
                        <h1 className="text-base sm:text-xl md:text-2xl lg:text-3xl font-extrabold text-gray-900 break-words">
                            Patient Messages
                        </h1>
                    </div>
                </div>

                <div className="flex-1 flex gap-4 sm:gap-6 min-h-0 overflow-hidden">
                    <div className="w-full sm:w-80 md:w-96 bg-white rounded-3xl shadow-xl border-2 border-gray-200 flex flex-col flex-shrink-0 min-h-0">
                        <div className="p-4 border-b border-gray-200 flex-shrink-0">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search patients..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm sm:text-base"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0">
                            {filteredPatients.length === 0 ? (
                                <div className="p-8 text-center">
                                    <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                    <p className="text-sm text-gray-600">
                                        {inbox.length === 0
                                            ? 'No linked patients yet. Add a Patient User ID on the dashboard first.'
                                            : 'No patients found'}
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-200">
                                    {filteredPatients.map((patient) => (
                                        <button
                                            key={patient.id}
                                            onClick={() => setSelectedPatientId(patient.id)}
                                            className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                                                selectedPatient?.id === patient.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                {patient.avatarUrl ? (
                                                    <img
                                                        src={patient.avatarUrl}
                                                        alt={patient.name}
                                                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                                        {getProfileInitials(patient.name)}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <h3 className="text-base sm:text-lg font-extrabold text-gray-900 truncate">
                                                            {patient.name}
                                                        </h3>
                                                        {patient.lastMessageAt && (
                                                            <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                                                                {formatChatTime(patient.lastMessageAt)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-400 font-mono mb-1">{patient.patientId}</p>
                                                    <p className="text-xs sm:text-sm text-gray-600 truncate">
                                                        {patient.lastMessageText || 'No messages yet'}
                                                    </p>
                                                    {patient.hasUnread && (
                                                        <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full">
                                                            New
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 bg-white rounded-3xl shadow-xl border-2 border-gray-200 flex flex-col min-h-0">
                        {selectedPatient ? (
                            <>
                                <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
                                    {selectedPatient.avatarUrl ? (
                                        <img
                                            src={selectedPatient.avatarUrl}
                                            alt={selectedPatient.name}
                                            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                            {getProfileInitials(selectedPatient.name)}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg sm:text-xl font-extrabold text-gray-900 truncate">
                                            {selectedPatient.name}
                                        </h3>
                                        <p className="text-xs sm:text-sm text-gray-500 font-mono">
                                            {selectedPatient.patientId}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => navigate(`/patients/${selectedPatient.id}`)}
                                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-sm transition-all duration-300"
                                    >
                                        View Profile
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                                    {currentMessages.length === 0 ? (
                                        <div className="h-full min-h-[12rem] flex flex-col items-center justify-center text-center">
                                            <MessageCircle className="w-12 h-12 text-gray-300 mb-3" />
                                            <p className="text-base font-bold text-gray-600">No messages yet</p>
                                            <p className="text-sm text-gray-500 mt-1">Start the conversation. This thread is stored in Supabase for both apps.</p>
                                        </div>
                                    ) : (
                                        currentMessages.map(renderMessage)
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <div className="p-4 sm:p-6 border-t border-gray-200 flex-shrink-0">
                                    {error && (
                                        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 flex items-start gap-2">
                                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                            <span>{error}</span>
                                        </div>
                                    )}
                                    <div className="flex items-end gap-2">
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
                                                className="w-full px-4 py-3 sm:py-4 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm sm:text-base disabled:bg-gray-50"
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
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center px-6">
                                    <MessageCircle className="w-16 h-16 sm:w-20 sm:h-20 text-gray-400 mx-auto mb-4" />
                                    <p className="text-lg sm:text-xl font-bold text-gray-600">Select a patient to start chatting</p>
                                    <p className="text-sm sm:text-base text-gray-500 mt-2">
                                        Linked patients come from the Patient User ID you add on the Doctor Dashboard.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DoctorChat;
