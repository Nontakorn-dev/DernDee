import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { fetchPatientDailyProgress } from '@shared/services/sessionService.js';
import {
    getBrowserBleDevicesSnapshot,
    subscribeToBrowserBleDevices,
} from '@shared/gateway/realtimeTransport.js';
import {
    Home as HomeIcon,
    User,
    Settings,
    Bluetooth,
    Clock,
    TrendingUp,
    Video,
    Bell,
    LogOut,
    Play,
    Footprints,
    Heart,
    Activity,
} from 'lucide-react';
import stepdeeLogo from '@shared/assets/images/stepdee-logo.png';
import doctorImageSrc from '@shared/assets/images/doctor.png';

const isBleDeviceConnected = (device) => device?.status === 'connected';

const tapClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2';

const Avatar = ({ src, name, initials }) => (
    <div className="w-14 h-14 sm:w-[72px] sm:h-[72px] text-lg sm:text-xl ring-4 ring-white rounded-full overflow-hidden bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0">
        {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
);

const Home = () => {
    const { logOut, profile, refreshProfile, user } = useUserAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [connectedCount, setConnectedCount] = useState(0);
    const [stepsProgress, setStepsProgress] = useState({ current: 0, target: 500 });
    const [heroImage, setHeroImage] = useState(doctorImageSrc);

    useEffect(() => {
        const fetchUserProfile = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            try {
                const data = profile || await refreshProfile();
                const configuredTargetSteps = Number(data?.preferences?.dailyStepGoal);
                const targetSteps = Number.isFinite(configuredTargetSteps) && configuredTargetSteps > 0
                    ? configuredTargetSteps
                    : 500;
                const dailyProgress = await fetchPatientDailyProgress(user.uid, targetSteps);

                setStepsProgress({
                    current: dailyProgress.currentSteps,
                    target: dailyProgress.targetSteps,
                });
            } catch (error) {
                console.error('Error fetching user profile:', error);
                setStepsProgress({ current: 0, target: 500 });
            } finally {
                setLoading(false);
            }
        };

        fetchUserProfile();
    }, [profile, refreshProfile, user]);

    useEffect(() => {
        const syncDevices = (devices = []) => {
            setConnectedCount(devices.filter(isBleDeviceConnected).length);
        };

        syncDevices(getBrowserBleDevicesSnapshot());
        return subscribeToBrowserBleDevices(syncDevices);
    }, []);

    const handleLogout = async () => {
        try {
            await logOut();
            navigate('/');
        } catch (err) {
            console.log(err.message);
        }
    };

    const displayName = profile?.full_name || user?.displayName || 'ผู้ใช้';
    const avatarUrl = profile?.avatar_url || user?.photoURL;
    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'DD';
    const stepsPercentage = Math.min((stepsProgress.current / Math.max(stepsProgress.target, 1)) * 100, 100);
    const isConnected = connectedCount > 0;

    if (loading) {
        return (
            <div className="min-h-screen bg-[#D7E6F2] flex items-center justify-center" style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-[3px] border-sky-200 border-t-sky-600 rounded-full animate-spin" />
                    <p className="text-base text-slate-600">กำลังโหลดหน้าหลัก...</p>
                </div>
            </div>
        );
    }

    const quickActions = [
        {
            title: 'Connected',
            thai: isConnected
                ? `อุปกรณ์เชื่อมต่อแล้ว${connectedCount > 1 ? ` ${connectedCount} เครื่อง` : ''}`
                : 'แตะเพื่อเชื่อมเซ็นเซอร์',
            icon: Bluetooth,
            iconWrap: 'bg-sky-500 text-white',
            card: 'bg-sky-50 border-sky-200 hover:border-sky-400 hover:bg-sky-100',
            titleColor: 'text-sky-950',
            onClick: () => navigate('/device-connection'),
            connected: isConnected,
        },
        {
            title: 'History',
            thai: 'ดูประวัติการฝึก',
            icon: Clock,
            iconWrap: 'bg-emerald-500 text-white',
            card: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100',
            titleColor: 'text-emerald-950',
            onClick: () => navigate('/history'),
        },
        {
            title: 'Analysis Result',
            thai: 'ผลการวิเคราะห์การเดิน',
            thaiMobile: 'ผลการวิเคราะห์',
            icon: TrendingUp,
            iconWrap: 'bg-violet-500 text-white',
            card: 'bg-violet-50 border-violet-200 hover:border-violet-400 hover:bg-violet-100',
            titleColor: 'text-violet-950',
            onClick: () => navigate('/walk-summary'),
        },
        {
            title: 'Telemedicine',
            thai: 'ปรึกษาแพทย์ออนไลน์',
            icon: Video,
            iconWrap: 'bg-orange-500 text-white',
            card: 'bg-orange-50 border-orange-200 hover:border-orange-400 hover:bg-orange-100',
            titleColor: 'text-orange-950',
            onClick: () => navigate('/telemedicine'),
        },
    ];

    return (
        <div
            className="min-h-screen bg-[#D7E6F2] text-slate-900"
            style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
        >
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-sky-100 pt-[env(safe-area-inset-top)]">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
                    <img src={stepdeeLogo} alt="StepDee" className="h-9 object-contain" />
                    <button
                        type="button"
                        className={`relative w-11 h-11 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center ${tapClass}`}
                        aria-label="การแจ้งเตือน"
                    >
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
                    </button>
                </div>
            </header>

            <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-5 sm:py-7 pb-8 space-y-4 sm:space-y-5">
                <section className="grid gap-4 lg:grid-cols-2">
                    <article className="rounded-[28px] border-2 border-sky-200 bg-sky-50 shadow-[0_8px_28px_rgba(14,165,233,0.10)] p-4 sm:p-6">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <Avatar src={avatarUrl} name={displayName} initials={initials} />
                            <div className="min-w-0 flex-1 flex items-center gap-2 sm:gap-3">
                                <h1 className="min-w-0 flex-1 text-lg sm:text-2xl font-bold tracking-tight truncate text-sky-950">
                                    {displayName}
                                </h1>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className={`shrink-0 inline-flex items-center justify-center gap-1.5 min-h-9 sm:min-h-11 px-2.5 sm:px-4 rounded-full border-2 border-sky-500 text-sky-700 font-semibold text-xs sm:text-sm bg-white hover:bg-sky-100 whitespace-nowrap ${tapClass}`}
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[28px] border-2 border-emerald-200 bg-emerald-50 shadow-[0_8px_28px_rgba(16,185,129,0.12)] p-5 sm:p-6 flex flex-col justify-center">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                                <Footprints className="w-5 h-5" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-emerald-800/70">Today&apos;s walk</p>
                                <p className="text-xl sm:text-2xl font-bold tabular-nums leading-tight text-emerald-950">
                                    {stepsProgress.current}
                                    <span className="text-emerald-700/60 font-semibold"> / {stepsProgress.target} Steps</span>
                                </p>
                            </div>
                        </div>
                        <div
                            className="mt-4 h-2.5 rounded-full bg-emerald-200/80 overflow-hidden"
                            role="progressbar"
                            aria-valuenow={stepsProgress.current}
                            aria-valuemin={0}
                            aria-valuemax={stepsProgress.target}
                            aria-label="ก้าวเดินวันนี้"
                        >
                            <div
                                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${Math.max(stepsPercentage, stepsProgress.current > 0 ? 2 : 0)}%` }}
                            />
                        </div>
                    </article>
                </section>

                <section className="relative overflow-hidden rounded-[24px] sm:rounded-[32px] min-h-[168px] sm:min-h-[220px] md:min-h-[248px] bg-gradient-to-r from-[#3B82F6] via-[#38BDF8] to-[#2DD4BF] shadow-[0_14px_40px_rgba(14,165,233,0.28)] flex items-center">
                    <Activity className="hidden sm:block absolute right-24 top-6 w-24 h-24 text-white/15" aria-hidden="true" />
                    <Heart className="hidden sm:block absolute right-8 top-16 w-16 h-16 text-white/10" aria-hidden="true" />
                    <Footprints className="hidden sm:block absolute right-36 bottom-8 w-20 h-20 text-white/10" aria-hidden="true" />

                    <div className="relative z-10 w-full p-4 sm:p-8 pr-[42%] sm:pr-8 sm:max-w-[52%] text-left">
                        <h2 className="text-white text-[28px] sm:text-5xl font-extrabold tracking-tight leading-none">Therapy</h2>
                        <p className="text-white text-sm sm:text-lg font-semibold mt-1 sm:mt-2">กายภาพบำบัด</p>
                        <p className="hidden sm:block text-white/90 text-base mt-1 leading-snug">
                            เริ่มต้นการฝึกเดินของคุณวันนี้
                        </p>
                        <button
                            type="button"
                            className={`mt-3 sm:mt-5 inline-flex items-center justify-center gap-2 min-h-10 sm:min-h-12 px-4 sm:px-6 rounded-full bg-white text-sky-600 font-bold text-sm sm:text-base shadow-sm hover:bg-sky-50 ${tapClass}`}
                            onClick={() => navigate('/therapy')}
                        >
                            <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                            Start Therapy
                        </button>
                    </div>
                    {heroImage ? (
                        <img
                            src={heroImage}
                            alt=""
                            className="absolute right-[-6px] bottom-[-20px] h-[98%] max-h-[168px] sm:h-[108%] sm:max-h-[280px] w-auto object-contain object-bottom pointer-events-none select-none drop-shadow-lg"
                            onError={() => setHeroImage(null)}
                        />
                    ) : null}
                </section>

                <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {quickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <button
                                key={action.title}
                                type="button"
                                onClick={action.onClick}
                                className={`rounded-[28px] border-2 shadow-[0_8px_24px_rgba(15,23,42,0.06)] ${action.card} ${tapClass} min-h-[152px] p-5 text-left flex flex-col items-start justify-center gap-3 hover:-translate-y-0.5 active:scale-[0.99] transition-all`}
                            >
                                <div className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-sm ${action.iconWrap}`}>
                                    <Icon className="w-7 h-7" aria-hidden="true" />
                                    {action.connected ? (
                                        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-white" />
                                    ) : null}
                                </div>
                                <div>
                                    <p className={`text-[17px] font-bold leading-tight ${action.titleColor}`}>{action.title}</p>
                                    <p className="text-sm text-slate-600 mt-1 leading-snug">
                                        {action.thaiMobile ? (
                                            <>
                                                <span className="sm:hidden">{action.thaiMobile}</span>
                                                <span className="hidden sm:inline">{action.thai}</span>
                                            </>
                                        ) : action.thai}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </section>

                <nav className="pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                    <div className="rounded-[28px] border-2 border-sky-100 bg-white/95 shadow-[0_10px_40px_rgba(15,23,42,0.12)]">
                        <div className="grid grid-cols-3">
                            <button
                                type="button"
                                onClick={() => navigate('/profile')}
                                className={`min-h-[68px] flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-700 ${tapClass} rounded-l-[28px]`}
                            >
                                <User className="w-6 h-6" />
                                <span className="text-xs font-medium">Profile</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-transparent" />
                            </button>
                            <button
                                type="button"
                                aria-current="page"
                                className={`min-h-[68px] flex flex-col items-center justify-center gap-1 text-sky-600 ${tapClass}`}
                            >
                                <HomeIcon className="w-6 h-6" />
                                <span className="text-xs font-semibold">Home</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/settings')}
                                className={`min-h-[68px] flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-700 ${tapClass} rounded-r-[28px]`}
                            >
                                <Settings className="w-6 h-6" />
                                <span className="text-xs font-medium">Settings</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-transparent" />
                            </button>
                        </div>
                    </div>
                </nav>
            </main>
        </div>
    );
};

export default Home;
