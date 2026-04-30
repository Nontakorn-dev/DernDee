import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { 
    ArrowLeft,
    Send,
    Search,
    MessageCircle,
    Clock,
    CheckCircle2
} from 'lucide-react';
import { mockPatients } from '../data/mockDoctorData';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const DoctorChat = () => {
    const navigate = useNavigate();
    const { user } = useUserAuth();
    const messagesEndRef = useRef(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [message, setMessage] = useState('');
    
    // Mock chat messages for each patient
    const [chatMessages, setChatMessages] = useState({
        'patient-001': [
            { id: 1, text: 'Hello Doctor, I have a question about my therapy progress.', sender: 'patient', timestamp: new Date(Date.now() - 3600000) },
            { id: 2, text: 'Hello! I\'m here to help. What would you like to know?', sender: 'doctor', timestamp: new Date(Date.now() - 3300000) },
            { id: 3, text: 'I noticed my walking speed has improved. Is this normal?', sender: 'patient', timestamp: new Date(Date.now() - 3000000) },
            { id: 4, text: 'Yes, that\'s excellent progress! Your cadence and step length have both improved significantly.', sender: 'doctor', timestamp: new Date(Date.now() - 2700000) }
        ],
        'patient-002': [
            { id: 1, text: 'Hi Doctor, when is my next review?', sender: 'patient', timestamp: new Date(Date.now() - 7200000) },
            { id: 2, text: 'Your next review is scheduled for January 18th. I\'ll review your latest session results then.', sender: 'doctor', timestamp: new Date(Date.now() - 6900000) }
        ],
        'patient-003': [
            { id: 1, text: 'Good morning Doctor!', sender: 'patient', timestamp: new Date(Date.now() - 1800000) },
            { id: 2, text: 'Good morning! How are you feeling today?', sender: 'doctor', timestamp: new Date(Date.now() - 1500000) }
        ]
    });

    const [currentMessages, setCurrentMessages] = useState([]);

    // Filter patients based on search
    const filteredPatients = mockPatients.filter(patient =>
        patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        patient.patientId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Auto scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages]);

    // Update messages when patient is selected
    useEffect(() => {
        if (selectedPatient) {
            setCurrentMessages(chatMessages[selectedPatient.id] || []);
        } else {
            setCurrentMessages([]);
        }
    }, [selectedPatient, chatMessages]);

    const handleSelectPatient = (patient) => {
        setSelectedPatient(patient);
    };

    const handleSendMessage = () => {
        if (message.trim() && selectedPatient) {
            const newMessage = {
                id: currentMessages.length + 1,
                text: message,
                sender: 'doctor',
                timestamp: new Date()
            };
            
            const updatedMessages = [...currentMessages, newMessage];
            setCurrentMessages(updatedMessages);
            setChatMessages(prev => ({
                ...prev,
                [selectedPatient.id]: updatedMessages
            }));
            setMessage('');

            // Simulate patient response after 3 seconds
            setTimeout(() => {
                const patientResponse = {
                    id: updatedMessages.length + 1,
                    text: 'Thank you for your response, Doctor.',
                    sender: 'patient',
                    timestamp: new Date()
                };
                const finalMessages = [...updatedMessages, patientResponse];
                setCurrentMessages(finalMessages);
                setChatMessages(prev => ({
                    ...prev,
                    [selectedPatient.id]: finalMessages
                }));
            }, 3000);
        }
    };

    const formatTime = (timestamp) => {
        const date = timestamp instanceof Date ? timestamp : timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getUnreadCount = (patientId) => {
        // In real implementation, count unread messages
        return 0;
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex flex-col">
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 lg:px-8 py-5 sm:py-6 md:py-7 flex items-center justify-start h-20 sm:h-24 md:h-28 flex-shrink-0">
                <div className="w-40 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 flex items-center justify-center">
                    <img 
                        src={derndeeLogo} 
                        alt="Derndee Logo" 
                        className="w-full h-full object-contain"
                    />
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col w-full p-3 sm:p-4 lg:p-6 min-h-0 overflow-hidden">
                {/* Title Section */}
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
                    {/* Patient List Sidebar */}
                    <div className="w-full sm:w-80 md:w-96 bg-white rounded-3xl shadow-xl border-2 border-gray-200 flex flex-col flex-shrink-0 min-h-0">
                        {/* Search */}
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

                        {/* Patient List */}
                        <div className="flex-1 overflow-y-auto min-h-0">
                            {filteredPatients.length === 0 ? (
                                <div className="p-8 text-center">
                                    <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                    <p className="text-sm text-gray-600">No patients found</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-200">
                                    {filteredPatients.map((patient) => {
                                        const messages = chatMessages[patient.id] || [];
                                        const lastMessage = messages[messages.length - 1];
                                        const unreadCount = getUnreadCount(patient.id);
                                        
                                        return (
                                            <button
                                                key={patient.id}
                                                onClick={() => handleSelectPatient(patient)}
                                                className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                                                    selectedPatient?.id === patient.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                                                }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                                        {patient.name.split(' ').map(n => n[0]).join('')}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <h3 className="text-base sm:text-lg font-extrabold text-gray-900 truncate">
                                                                {patient.name}
                                                            </h3>
                                                            {lastMessage && (
                                                                <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                                                                    {formatTime(lastMessage.timestamp)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs sm:text-sm text-gray-600 truncate">
                                                            {lastMessage ? lastMessage.text : 'No messages yet'}
                                                        </p>
                                                        {unreadCount > 0 && (
                                                            <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full">
                                                                {unreadCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 bg-white rounded-3xl shadow-xl border-2 border-gray-200 flex flex-col min-h-0">
                        {selectedPatient ? (
                            <>
                                {/* Chat Header */}
                                <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                        {selectedPatient.name.split(' ').map(n => n[0]).join('')}
                                    </div>
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

                                {/* Messages Area */}
                                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                                    {currentMessages.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={`flex ${msg.sender === 'doctor' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div className={`max-w-[80%] sm:max-w-[70%] ${
                                                msg.sender === 'doctor' 
                                                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl rounded-tr-sm' 
                                                    : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm'
                                            } p-3 sm:p-4 shadow-lg`}>
                                                <p className="text-sm sm:text-base whitespace-pre-wrap">{msg.text}</p>
                                                <p className={`text-xs mt-2 ${
                                                    msg.sender === 'doctor' ? 'text-blue-100' : 'text-gray-500'
                                                }`}>
                                                    {formatTime(msg.timestamp)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Input Area */}
                                <div className="p-4 sm:p-6 border-t border-gray-200 flex-shrink-0">
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                value={message}
                                                onChange={(e) => setMessage(e.target.value)}
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendMessage();
                                                    }
                                                }}
                                                placeholder="Type your message..."
                                                className="w-full px-4 py-3 sm:py-4 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm sm:text-base"
                                            />
                                        </div>
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!message.trim()}
                                            className="p-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                        >
                                            <Send className="w-5 h-5 sm:w-6 sm:h-6" />
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <MessageCircle className="w-16 h-16 sm:w-20 sm:h-20 text-gray-400 mx-auto mb-4" />
                                    <p className="text-lg sm:text-xl font-bold text-gray-600">Select a patient to start chatting</p>
                                    <p className="text-sm sm:text-base text-gray-500 mt-2">Choose a patient from the list to view messages</p>
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
