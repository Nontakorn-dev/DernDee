import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { fetchPatientHistorySessions } from '@shared/services/sessionService.js';
import {
    ArrowLeft,
    Search,
    Filter,
    ChevronDown,
    Calendar,
    BarChart3,
    Heart,
    Clock,
    X
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

    useEffect(() => {
        const fetchHistory = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            try {
                const sessions = await fetchPatientHistorySessions(user.uid);
                setHistoryData(sessions);
                setFilteredData(sessions);
            } catch (error) {
                console.error("Error fetching history:", error);
                setHistoryData([]);
                setFilteredData([]);
            } finally {
                setLoading(false);
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
                const sessionLabel = session.sessionLabel || '';
                const sessionDescription = session.sessionDescription || '';
                return dateStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    timeStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    sessionLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    sessionDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
                            (() => {
                                const toneStyle = getToneStyle(session.sessionTone);

                                return (
                                    <div
                                        key={session.id}
                                        className={`rounded-3xl shadow-xl p-4 sm:p-6 border-2 transition-all duration-300 cursor-pointer ${toneStyle.card}`}
                                        onClick={() => navigate(`/walk-summary?sessionId=${session.id}`)}
                                    >
                                        <div className="flex flex-col gap-4">
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                                <div className="flex-1">
                                                    <div className="flex flex-wrap items-center gap-3 mb-2">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${toneStyle.badge}`}>
                                                            {session.sessionLabel || 'Therapy Session'}
                                                        </span>
                                                        <div className="flex items-center gap-2 text-gray-700">
                                                            <Calendar className={`w-4 h-4 ${toneStyle.icon}`} />
                                                            <span className="text-base sm:text-lg font-bold text-gray-900">
                                                                {formatDate(session.date || session.createdAt)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-gray-500">
                                                            <Clock className="w-4 h-4" />
                                                            <span className="text-sm sm:text-base text-gray-600">
                                                                {formatTime(session.date || session.createdAt)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm text-gray-500">
                                                        {session.sessionDescription || 'Session summary'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                                                {(session.cardMetrics || []).map((metric) => (
                                                    <div key={`${session.id}-${metric.label}`} className={`rounded-2xl border bg-white p-3 sm:p-4 ${toneStyle.metricCard}`}>
                                                        <p className="text-xs text-gray-500 mb-1">{metric.label}</p>
                                                        <p className="text-sm sm:text-base font-bold text-gray-900">{metric.value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()
                        ))
                    )}
                </div>
            </main>
        </div>
    );
};

export default History;

