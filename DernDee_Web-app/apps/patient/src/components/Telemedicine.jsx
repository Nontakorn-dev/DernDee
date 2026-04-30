import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Send,
    Paperclip,
    FileText,
    Clock,
    Star,
    CheckCircle2,
    X,
    Calendar,
    Video,
    Phone
} from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const Telemedicine = () => {
    const navigate = useNavigate();
    const messagesEndRef = useRef(null);
    const [message, setMessage] = useState('');
    const [showAnalysisResults, setShowAnalysisResults] = useState(false);

    // Single doctor data - in real implementation, this would be fetched from API
    const [doctor] = useState({
        id: 1,
        name: 'Dr. Sarah Johnson',
        specialty: 'Physical Therapy',
        status: 'available', // 'available', 'busy', 'offline'
    });

    // Mock analysis results - in real implementation, this would be fetched from API/Firebase
    const [analysisResults] = useState([
        {
            id: 'result-1',
            date: '2024-01-15',
            cadence: 110,
            stepLength: 0.75,
            strideLength: 1.5,
            walkingSpeed: 1.2,
            duration: '05:00',
            totalSteps: 280
        },
        {
            id: 'result-2',
            date: '2024-01-14',
            cadence: 105,
            stepLength: 0.72,
            strideLength: 1.45,
            walkingSpeed: 1.15,
            duration: '05:30',
            totalSteps: 290
        },
        {
            id: 'result-3',
            date: '2024-01-13',
            cadence: 108,
            stepLength: 0.73,
            strideLength: 1.48,
            walkingSpeed: 1.18,
            duration: '04:45',
            totalSteps: 265
        }
    ]);

    // Mock chat messages
    const [messages, setMessages] = useState([
        {
            id: 1,
            text: 'Hello! How can I help you today?',
            sender: 'doctor',
            timestamp: new Date(Date.now() - 3600000)
        },
        {
            id: 2,
            text: 'Hi Doctor, I would like to share my latest therapy results.',
            sender: 'user',
            timestamp: new Date(Date.now() - 3300000)
        },
        {
            id: 3,
            text: 'Of course! Please share your analysis results and I will review them.',
            sender: 'doctor',
            timestamp: new Date(Date.now() - 3000000)
        }
    ]);

    // Auto scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = () => {
        if (message.trim()) {
            const newMessage = {
                id: messages.length + 1,
                text: message,
                sender: 'user',
                timestamp: new Date()
            };
            setMessages([...messages, newMessage]);
            setMessage('');

            // Simulate doctor response after 2 seconds
            setTimeout(() => {
                const doctorResponse = {
                    id: messages.length + 2,
                    text: 'Thank you for sharing. I will review this and get back to you shortly.',
                    sender: 'doctor',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, doctorResponse]);
            }, 2000);
        }
    };

    const handleSendAnalysisResult = (result) => {
        const resultText = `Analysis Result - ${result.date}\n` +
            `Cadence: ${result.cadence} steps/min\n` +
            `Step Length: ${result.stepLength} m\n` +
            `Stride Length: ${result.strideLength} m\n` +
            `Walking Speed: ${result.walkingSpeed} m/s\n` +
            `Duration: ${result.duration}\n` +
            `Total Steps: ${result.totalSteps}`;

        const newMessage = {
            id: messages.length + 1,
            text: resultText,
            sender: 'user',
            timestamp: new Date(),
            isAnalysisResult: true,
            analysisData: result
        };
        setMessages([...messages, newMessage]);
        setShowAnalysisResults(false);

        // Simulate doctor response after 2 seconds
        setTimeout(() => {
            const doctorResponse = {
                id: messages.length + 2,
                text: 'Thank you for sharing your analysis results. I can see improvements in your cadence and walking speed. Let\'s discuss your progress in detail.',
                sender: 'doctor',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, doctorResponse]);
        }, 2000);
    };

    const formatTime = (timestamp) => {
        const date = timestamp instanceof Date ? timestamp : timestamp.toDate();
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'available':
                return 'bg-green-500';
            case 'busy':
                return 'bg-yellow-500';
            case 'offline':
                return 'bg-gray-400';
            default:
                return 'bg-gray-400';
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'available':
                return 'Available';
            case 'busy':
                return 'Busy';
            case 'offline':
                return 'Offline';
            default:
                return 'Unknown';
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex flex-col">
            {/* Header */}
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/home')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <img src={derndeeLogo} alt="DernDee" className="h-8 sm:h-10 md:h-12 object-contain" />
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full p-3 sm:p-4 lg:p-6 min-h-0">
                {/* Title Card */}
                <div className="bg-white rounded-3xl shadow-2xl p-3 sm:p-4 mb-2 sm:mb-3 flex-shrink-0">
                    <div className="flex items-center justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-3 sm:gap-4 flex-1">
                            {/* <button
                                onClick={() => navigate('/home')}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                            >
                                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                            </button> */}
                            <div className="flex items-center gap-3 sm:gap-4 flex-1">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg sm:text-xl flex-shrink-0">
                                    {doctor.name.split(' ').map(n => n[0]).join('')}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold text-gray-900 tracking-tight">
                                        {doctor.name}
                                    </h1>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className={`w-2 h-2 rounded-full ${getStatusColor(doctor.status)} animate-pulse`}></div>
                                        <span className="text-xs sm:text-sm font-semibold text-gray-600">
                                            {getStatusText(doctor.status)}
                                        </span>
                                        <span className="text-xs sm:text-sm text-gray-500">•</span>
                                        <span className="text-xs sm:text-sm font-semibold text-blue-600">
                                            {doctor.specialty}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Chat Messages Area */}
                <div className="flex-1 bg-white rounded-3xl shadow-2xl p-4 sm:p-6 overflow-hidden flex flex-col min-h-0">
                    {/* Call Buttons - Top of Chat */}
                    <div className="flex items-center justify-center gap-3 mb-4 pb-4 border-b border-gray-200">
                        <button
                            onClick={() => alert('Starting video call...')}
                            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2"
                            title="Video Call"
                        >
                            <Video className="w-5 h-5 sm:w-6 sm:h-6" />
                            <span className="text-sm sm:text-base font-bold">Video Call</span>
                        </button>
                        <button
                            onClick={() => alert('Starting voice call...')}
                            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2"
                            title="Voice Call"
                        >
                            <Phone className="w-5 h-5 sm:w-6 sm:h-6" />
                            <span className="text-sm sm:text-base font-bold">Voice Call</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[80%] sm:max-w-[70%] md:max-w-[60%] ${msg.sender === 'user'
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl rounded-tr-sm'
                                        : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm'
                                    } p-3 sm:p-4 shadow-lg`}>
                                    {msg.isAnalysisResult ? (
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <FileText className="w-4 h-4" />
                                                <span className="font-bold text-sm">Analysis Result</span>
                                            </div>
                                            <div className="text-sm space-y-1">
                                                <p className="font-semibold">{msg.analysisData.date}</p>
                                                <p>Cadence: {msg.analysisData.cadence} steps/min</p>
                                                <p>Step Length: {msg.analysisData.stepLength} m</p>
                                                <p>Stride Length: {msg.analysisData.strideLength} m</p>
                                                <p>Walking Speed: {msg.analysisData.walkingSpeed} m/s</p>
                                                <p>Duration: {msg.analysisData.duration}</p>
                                                <p>Total Steps: {msg.analysisData.totalSteps}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm sm:text-base whitespace-pre-wrap">{msg.text}</p>
                                    )}
                                    <p className={`text-xs mt-2 ${msg.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
                                        }`}>
                                        {formatTime(msg.timestamp)}
                                    </p>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="flex-shrink-0">
                        {/* Analysis Results Dropdown */}
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
                                                    <span className="font-semibold text-sm text-gray-900">{result.date}</span>
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
                            </div>
                        )}

                        <div className="flex items-end gap-2">
                            <button
                                onClick={() => setShowAnalysisResults(!showAnalysisResults)}
                                className="p-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex-shrink-0"
                                title="Send Analysis Result"
                            >
                                <Paperclip className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
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
                                    className="w-full px-4 py-3 sm:py-4 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm sm:text-base pr-12"
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
                </div>
            </main>
        </div>
    );
};

export default Telemedicine;
