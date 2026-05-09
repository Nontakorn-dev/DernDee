import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Footprints, Mountain, Target, Music, Timer } from 'lucide-react';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const TherapySelect = () => {
    const navigate = useNavigate();

    const therapyModes = [
        {
            id: 'clearance',
            title: 'High Stepper',
            description: 'Train high knees, fix foot dragging.',
            icon: Mountain,
            iconBg: 'bg-orange-100',
            iconColor: 'text-orange-600',
            route: '/game/clearance'
        },
        {
            id: 'balance',
            title: 'Magic Plate',
            description: 'Train foot placement and balance.',
            icon: Target,
            iconBg: 'bg-yellow-100',
            iconColor: 'text-yellow-600',
            route: '/game/balance'
        },
        {
            id: 'rhythm',
            title: 'Rhythm Drummer',
            description: 'Walk consistently to the beat.',
            icon: Music,
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            route: '/game/rhythm'
        },
        {
            id: 'stepping-stones',
            title: 'Stepping Stones',
            description: 'Train step reach and safe weight shift.',
            icon: Footprints,
            iconBg: 'bg-emerald-100',
            iconColor: 'text-emerald-600',
            route: '/game/stepping-stones'
        },
        {
            id: 'freewalk',
            title: 'Free Walk',
            description: 'General walking exercise with AI.',
            icon: Timer,
            iconBg: 'bg-green-100',
            iconColor: 'text-green-600',
            route: '/walk-session'
        }
    ];

    const handleCardClick = (route) => {
        navigate('/calibration', { state: { target: route } });
    };

    const openGaitDashboard = () => {
        navigate('/gait-dashboard');
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 font-sans">
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
                <div className="w-8"></div> {/* Spacer for balance if needed, or just empty */}
            </header>

            {/* Main Content */}
            <main className="p-6 sm:p-8 md:p-12 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
                {/* Title */}
                <div className="text-center mb-8 sm:mb-12 space-y-2">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-gray-800 tracking-tight leading-tight">
                        Choose Therapy Mode
                    </h1>
                    <p className="text-base sm:text-lg md:text-xl text-gray-500 font-medium tracking-wide">
                        Select your training program today
                    </p>
                    <div className="pt-3">
                        <button
                            onClick={openGaitDashboard}
                            className="inline-flex items-center gap-2 rounded-full border-2 border-blue-200 bg-white px-5 py-2.5 text-sm sm:text-base font-bold text-blue-700 shadow-md transition-all hover:scale-[1.02] hover:bg-blue-50"
                        >
                            <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span>Open Gait Dashboard</span>
                        </button>
                    </div>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 w-full max-w-4xl">
                    {therapyModes.map((mode) => {
                        const IconComponent = mode.icon;
                        return (
                            <div
                                key={mode.id}
                                onClick={() => handleCardClick(mode.route)}
                                className="group bg-white rounded-[2rem] shadow-xl hover:shadow-2xl border-4 border-transparent hover:border-blue-200 p-5 sm:p-6 flex flex-col items-center justify-center text-center hover:scale-[1.02] transition-all duration-300 cursor-pointer min-h-[180px] sm:min-h-[220px]"
                            >
                                <div className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 ${mode.iconBg} rounded-full flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                                    <IconComponent className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 ${mode.iconColor}`} />
                                </div>
                                <h2 className="text-xl sm:text-2xl font-black text-gray-800 mb-2 tracking-tight">
                                    {mode.title}
                                </h2>
                                <p className="text-sm sm:text-base text-gray-500 font-medium leading-relaxed">
                                    {mode.description}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </main>
        </div>
    );
};

export default TherapySelect;
