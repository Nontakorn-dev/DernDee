import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@shared/firebase.js';
import {
    ArrowLeft,
    Search,
    Filter,
    ChevronDown,
    Calendar,
    BarChart3,
    Heart,
    Clock,
    Footprints,
    TrendingUp,
    X
} from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const History = () => {
    const navigate = useNavigate();
    const { user } = useUserAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [sortBy, setSortBy] = useState('Date');
    const [historyData, setHistoryData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterTimeFrom, setFilterTimeFrom] = useState('');
    const [filterTimeTo, setFilterTimeTo] = useState('');

    // Mock data structure - in real implementation, fetch from Firebase
    useEffect(() => {
        const fetchHistory = async () => {
            if (user) {
                try {
                    const sessionsRef = collection(db, 'walkSessions');
                    const q = query(
                        sessionsRef,
                        where('userId', '==', user.uid),
                        orderBy('createdAt', 'desc')
                    );
                    const querySnapshot = await getDocs(q);

                    const sessions = [];
                    querySnapshot.forEach((doc) => {
                        sessions.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });

                    // If no data, use mock data
                    if (sessions.length === 0) {
                        const mockSessions = [
                            {
                                id: '1',
                                cadence: 110,
                                stepLength: 0.75,
                                strideLength: 1.5,
                                walkingSpeed: 1.2,
                                duration: '05:00',
                                totalSteps: 280,
                                createdAt: new Date('2024-01-15T10:30:00'),
                                date: new Date('2024-01-15T10:30:00')
                            },
                            {
                                id: '2',
                                cadence: 105,
                                stepLength: 0.72,
                                strideLength: 1.45,
                                walkingSpeed: 1.15,
                                duration: '05:30',
                                totalSteps: 290,
                                createdAt: new Date('2024-01-14T14:20:00'),
                                date: new Date('2024-01-14T14:20:00')
                            },
                            {
                                id: '3',
                                cadence: 108,
                                stepLength: 0.73,
                                strideLength: 1.48,
                                walkingSpeed: 1.18,
                                duration: '04:45',
                                totalSteps: 265,
                                createdAt: new Date('2024-01-13T09:15:00'),
                                date: new Date('2024-01-13T09:15:00')
                            },
                            {
                                id: '4',
                                cadence: 112,
                                stepLength: 0.77,
                                strideLength: 1.52,
                                walkingSpeed: 1.25,
                                duration: '06:00',
                                totalSteps: 300,
                                createdAt: new Date('2024-01-12T16:45:00'),
                                date: new Date('2024-01-12T16:45:00')
                            },
                            {
                                id: '5',
                                cadence: 107,
                                stepLength: 0.71,
                                strideLength: 1.43,
                                walkingSpeed: 1.16,
                                duration: '05:15',
                                totalSteps: 275,
                                createdAt: new Date('2024-01-11T11:00:00'),
                                date: new Date('2024-01-11T11:00:00')
                            }
                        ];
                        setHistoryData(mockSessions);
                        setFilteredData(mockSessions);
                    } else {
                        // Convert Firestore timestamps
                        const processedSessions = sessions.map(session => ({
                            ...session,
                            createdAt: session.createdAt?.toDate ? session.createdAt.toDate() : new Date(session.createdAt),
                            date: session.date?.toDate ? session.date.toDate() : new Date(session.date || session.createdAt)
                        }));
                        setHistoryData(processedSessions);
                        setFilteredData(processedSessions);
                    }
                } catch (error) {
                    console.error("Error fetching history:", error);
                    // Use mock data on error
                    const mockSessions = [
                        {
                            id: '1',
                            cadence: 110,
                            stepLength: 0.75,
                            strideLength: 1.5,
                            walkingSpeed: 1.2,
                            duration: '05:00',
                            totalSteps: 280,
                            createdAt: new Date('2024-01-15T10:30:00'),
                            date: new Date('2024-01-15T10:30:00')
                        }
                    ];
                    setHistoryData(mockSessions);
                    setFilteredData(mockSessions);
                } finally {
                    setLoading(false);
                }
            }
        };

        fetchHistory();
    }, [user]);

    // Apply filters and search
    useEffect(() => {
        let filtered = [...historyData];

        // Apply search
        if (searchQuery.trim()) {
            filtered = filtered.filter(session => {
                const dateStr = formatDate(session.date || session.createdAt);
                const timeStr = formatTime(session.date || session.createdAt);
                return dateStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    timeStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    session.totalSteps?.toString().includes(searchQuery);
            });
        }

        // Apply date filter
        if (filterDateFrom) {
            const fromDate = new Date(filterDateFrom);
            fromDate.setHours(0, 0, 0, 0);
            filtered = filtered.filter(session => {
                const sessionDate = new Date(session.date || session.createdAt);
                sessionDate.setHours(0, 0, 0, 0);
                return sessionDate >= fromDate;
            });
        }

        if (filterDateTo) {
            const toDate = new Date(filterDateTo);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(session => {
                const sessionDate = new Date(session.date || session.createdAt);
                sessionDate.setHours(0, 0, 0, 0);
                return sessionDate <= toDate;
            });
        }

        // Apply time filter
        if (filterTimeFrom) {
            filtered = filtered.filter(session => {
                const sessionTime = new Date(session.date || session.createdAt);
                const [hours, minutes] = filterTimeFrom.split(':');
                const filterTime = new Date();
                filterTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                return sessionTime.getHours() * 60 + sessionTime.getMinutes() >= filterTime.getHours() * 60 + filterTime.getMinutes();
            });
        }

        if (filterTimeTo) {
            filtered = filtered.filter(session => {
                const sessionTime = new Date(session.date || session.createdAt);
                const [hours, minutes] = filterTimeTo.split(':');
                const filterTime = new Date();
                filterTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                return sessionTime.getHours() * 60 + sessionTime.getMinutes() <= filterTime.getHours() * 60 + filterTime.getMinutes();
            });
        }

        // Apply sort
        filtered.sort((a, b) => {
            const dateA = new Date(a.date || a.createdAt);
            const dateB = new Date(b.date || b.createdAt);

            switch (sortBy) {
                case 'Date':
                    return dateB - dateA; // Newest first
                case 'Confidence':
                    // Sort by walking speed (higher = better confidence)
                    return (b.walkingSpeed || 0) - (a.walkingSpeed || 0);
                case 'Analysis Result':
                    // Sort by cadence (higher = better result)
                    return (b.cadence || 0) - (a.cadence || 0);
                default:
                    return dateB - dateA;
            }
        });

        setFilteredData(filtered);
    }, [searchQuery, filterDateFrom, filterDateTo, filterTimeFrom, filterTimeTo, sortBy, historyData]);

    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp instanceof Date ? timestamp : timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp instanceof Date ? timestamp : timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDateTime = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp instanceof Date ? timestamp : timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };


    const handleSortChange = (sortOption) => {
        setSortBy(sortOption);
        setShowSortDropdown(false);
    };

    const clearFilters = () => {
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterTimeFrom('');
        setFilterTimeTo('');
        setShowFilterModal(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-700 text-lg font-semibold">Loading history...</p>
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
                        onClick={() => navigate('/home')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <img src={derndeeLogo} alt="DernDee" className="h-8 sm:h-10 md:h-12 object-contain" />
                </div>
            </header>

            {/* Main Content */}
            <main className="p-3 sm:p-4 lg:p-6 pb-6 max-w-7xl mx-auto">
                {/* Title Section */}
                <div className="mb-4 sm:mb-6">
                    <div className="flex items-center gap-2 sm:gap-3 mb-4">
                        {/* <button
                            onClick={() => navigate('/home')}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                        </button> */}
                        <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-gray-900 break-words">
                            Therapy Measurement History
                        </h1>
                    </div>

                    {/* Search and Filter Bar */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-4">
                        {/* Search Bar */}
                        <div className="flex-1 relative">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search history..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm sm:text-base"
                            />
                        </div>

                        {/* Filter Button */}
                        <button
                            onClick={() => setShowFilterModal(!showFilterModal)}
                            className="px-4 py-3 bg-white border-2 border-gray-200 hover:border-blue-500 rounded-xl font-bold text-sm sm:text-base transition-all duration-300 flex items-center gap-2"
                        >
                            <Filter className="w-5 h-5" />
                            <span>Filter</span>
                        </button>

                        {/* Sort Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowSortDropdown(!showSortDropdown)}
                                className="px-4 py-3 bg-white border-2 border-gray-200 hover:border-blue-500 rounded-xl font-bold text-sm sm:text-base transition-all duration-300 flex items-center gap-2 w-full sm:w-auto"
                            >
                                <ChevronDown className="w-5 h-5" />
                                <span>Sort by: {sortBy}</span>
                                <ChevronDown className={`w-4 h-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Sort Dropdown Menu */}
                            {showSortDropdown && (
                                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border-2 border-gray-200 z-50">
                                    <button
                                        onClick={() => handleSortChange('Date')}
                                        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors ${sortBy === 'Date' ? 'bg-blue-50' : ''
                                            }`}
                                    >
                                        <Calendar className={`w-5 h-5 ${sortBy === 'Date' ? 'text-blue-600' : 'text-gray-600'}`} />
                                        <span className={`font-bold ${sortBy === 'Date' ? 'text-blue-600' : 'text-gray-900'}`}>
                                            Date
                                        </span>
                                        {sortBy === 'Date' && <ChevronDown className="w-4 h-4 text-blue-600 ml-auto" />}
                                    </button>
                                    <button
                                        onClick={() => handleSortChange('Confidence')}
                                        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors ${sortBy === 'Confidence' ? 'bg-blue-50' : ''
                                            }`}
                                    >
                                        <BarChart3 className={`w-5 h-5 ${sortBy === 'Confidence' ? 'text-blue-600' : 'text-gray-600'}`} />
                                        <span className={`font-bold ${sortBy === 'Confidence' ? 'text-blue-600' : 'text-gray-900'}`}>
                                            Confidence
                                        </span>
                                        {sortBy === 'Confidence' && <ChevronDown className="w-4 h-4 text-blue-600 ml-auto" />}
                                    </button>
                                    <button
                                        onClick={() => handleSortChange('Analysis Result')}
                                        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors rounded-b-xl ${sortBy === 'Analysis Result' ? 'bg-blue-50' : ''
                                            }`}
                                    >
                                        <Heart className={`w-5 h-5 ${sortBy === 'Analysis Result' ? 'text-blue-600' : 'text-gray-600'}`} />
                                        <span className={`font-bold ${sortBy === 'Analysis Result' ? 'text-blue-600' : 'text-gray-900'}`}>
                                            Analysis Result
                                        </span>
                                        {sortBy === 'Analysis Result' && <ChevronDown className="w-4 h-4 text-blue-600 ml-auto" />}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Filter Modal */}
                    {showFilterModal && (
                        <div className="mb-4 bg-white rounded-2xl border-2 border-blue-200 p-4 sm:p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Filter by Date & Time</h3>
                                <button
                                    onClick={() => setShowFilterModal(false)}
                                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Date From</label>
                                    <input
                                        type="date"
                                        value={filterDateFrom}
                                        onChange={(e) => setFilterDateFrom(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Date To</label>
                                    <input
                                        type="date"
                                        value={filterDateTo}
                                        onChange={(e) => setFilterDateTo(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Time From</label>
                                    <input
                                        type="time"
                                        value={filterTimeFrom}
                                        onChange={(e) => setFilterTimeFrom(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Time To</label>
                                    <input
                                        type="time"
                                        value={filterTimeTo}
                                        onChange={(e) => setFilterTimeTo(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-3 mt-4">
                                <button
                                    onClick={clearFilters}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-semibold transition-colors"
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={() => setShowFilterModal(false)}
                                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-all duration-300"
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* History List */}
                <div className="space-y-3 sm:space-y-4">
                    {filteredData.length === 0 ? (
                        <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-12 text-center">
                            <Clock className="w-16 h-16 sm:w-20 sm:h-20 text-gray-400 mx-auto mb-4" />
                            <p className="text-lg sm:text-xl font-bold text-gray-600">No history found</p>
                            <p className="text-sm sm:text-base text-gray-500 mt-2">Try adjusting your filters or search query</p>
                        </div>
                    ) : (
                        filteredData.map((session) => (
                            <div
                                key={session.id}
                                className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 border-2 border-gray-200 hover:border-blue-300 transition-all duration-300 cursor-pointer"
                                onClick={() => navigate('/analysis-result', { state: { session } })}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <Calendar className="w-5 h-5 text-blue-600" />
                                            <span className="text-base sm:text-lg font-bold text-gray-900">
                                                {formatDate(session.date || session.createdAt)}
                                            </span>
                                            <Clock className="w-4 h-4 text-gray-500 ml-2" />
                                            <span className="text-sm sm:text-base text-gray-600">
                                                {formatTime(session.date || session.createdAt)}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-3">
                                            <div className="flex items-center gap-2">
                                                <Footprints className="w-4 h-4 text-blue-500" />
                                                <div>
                                                    <p className="text-xs text-gray-500">Steps</p>
                                                    <p className="text-sm sm:text-base font-bold text-gray-900">{session.totalSteps || 0}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="w-4 h-4 text-green-500" />
                                                <div>
                                                    <p className="text-xs text-gray-500">Cadence</p>
                                                    <p className="text-sm sm:text-base font-bold text-gray-900">{session.cadence || 0} /min</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-purple-500" />
                                                <div>
                                                    <p className="text-xs text-gray-500">Duration</p>
                                                    <p className="text-sm sm:text-base font-bold text-gray-900">{session.duration || '00:00'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4 text-orange-500" />
                                                <div>
                                                    <p className="text-xs text-gray-500">Speed</p>
                                                    <p className="text-sm sm:text-base font-bold text-gray-900">{session.walkingSpeed?.toFixed(2) || '0.00'} m/s</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
};

export default History;

