import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Globe, Bell, Shield, Info, Trash2, Download, Target, User } from 'lucide-react';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { deleteOwnAccount, updateUserPreferences } from '@shared/services/profileService.js';
import { fetchPatientHistorySessions } from '@shared/services/sessionService.js';
import {
    applyUserPreferences,
    normalizeUserPreferences,
} from '@shared/services/userPreferences.js';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';

const Settings = () => {
    const navigate = useNavigate();
    const { user, profile, refreshProfile, logOut } = useUserAuth();
    const [preferences, setPreferences] = useState(normalizeUserPreferences(profile?.preferences));
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        setPreferences(normalizeUserPreferences(profile?.preferences));
    }, [profile?.preferences]);

    const persistPreferences = async (nextPreferences) => {
        if (!user?.uid) {
            return;
        }

        const normalized = applyUserPreferences(nextPreferences);
        setPreferences(normalized);
        setSaving(true);
        setError('');
        setMessage('');

        try {
            const updatedProfile = await updateUserPreferences(user.uid, normalized);
            applyUserPreferences(updatedProfile.preferences);
            await refreshProfile();
            setMessage('Settings saved');
            window.setTimeout(() => setMessage(''), 2000);
        } catch (saveError) {
            console.error('Failed to save settings:', saveError);
            setError(saveError.message || 'Failed to save settings');
            setPreferences(normalizeUserPreferences(profile?.preferences));
            applyUserPreferences(profile?.preferences);
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = (key) => {
        const nextValue = !preferences[key];
        void persistPreferences({
            ...preferences,
            [key]: nextValue,
        });
    };

    const handleThemeToggle = () => {
        void persistPreferences({
            ...preferences,
            theme: preferences.theme === 'dark' ? 'light' : 'dark',
        });
    };

    const handleLanguageChange = (event) => {
        void persistPreferences({
            ...preferences,
            language: event.target.value,
        });
    };

    const handleDailyStepGoalChange = (event) => {
        setPreferences((current) => ({
            ...current,
            dailyStepGoal: event.target.value,
        }));
    };

    const handleDailyStepGoalBlur = () => {
        const dailyStepGoal = Number(preferences.dailyStepGoal);
        void persistPreferences({
            ...preferences,
            dailyStepGoal,
        });
    };

    const handleNotificationsToggle = async () => {
        const enabling = !preferences.notifications;

        if (enabling && typeof Notification !== 'undefined' && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setError('Browser notifications were not allowed. The reminder preference was not turned on.');
                return;
            }
        }

        void persistPreferences({
            ...preferences,
            notifications: enabling,
        });
    };

    const handleExportData = async () => {
        if (!user?.uid) {
            return;
        }

        setExporting(true);
        setError('');

        try {
            const sessions = await fetchPatientHistorySessions(user.uid);
            const payload = {
                exportedAt: new Date().toISOString(),
                profile: {
                    id: user.uid,
                    email: user.email,
                    fullName: profile?.full_name || user.displayName,
                    phone: profile?.phone || '',
                    preferences: normalizeUserPreferences(profile?.preferences),
                },
                sessions: sessions.map((session) => ({
                    id: session.id,
                    sessionType: session.sessionType,
                    sessionLabel: session.sessionLabel,
                    startTime: session.startTime,
                    duration: session.duration,
                    totalSteps: session.totalSteps,
                    cadence: session.cadence,
                    stepLength: session.stepLength,
                    strideLength: session.strideLength,
                    walkingSpeed: session.walkingSpeed,
                    clearance: session.clearance,
                    status: session.status,
                })),
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `derndee-data-${user.uid.slice(0, 8)}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            setMessage('Data exported');
            window.setTimeout(() => setMessage(''), 2000);
        } catch (exportError) {
            console.error('Failed to export data:', exportError);
            setError(exportError.message || 'Failed to export data');
        } finally {
            setExporting(false);
        }
    };

    const handleDeleteAccount = async () => {
        const confirmed = window.confirm('This permanently deletes your account, sessions, and chat. This cannot be undone.');
        if (!confirmed) {
            return;
        }

        const typed = window.prompt('Type DELETE to confirm account deletion.');
        if (typed !== 'DELETE') {
            return;
        }

        setDeleting(true);
        setError('');

        try {
            await deleteOwnAccount();
            await logOut().catch(() => null);
            window.location.assign('/login');
        } catch (deleteError) {
            console.error('Failed to delete account:', deleteError);
            setError(deleteError.message || 'Failed to delete account');
            setDeleting(false);
        }
    };

    const labels = preferences.language === 'en'
        ? {
            title: 'Settings',
            subtitle: 'These choices are saved to your profile',
            appearance: 'Appearance',
            darkMode: 'Dark mode',
            darkModeHelp: 'Use a darker theme across the patient app',
            language: 'Language',
            languageHelp: 'Used for dates and this settings page',
            therapy: 'Therapy',
            stepGoal: 'Daily step goal',
            stepGoalHelp: 'Used on the home progress card',
            notifications: 'Notifications',
            reminders: 'Therapy reminders',
            remindersHelp: 'Allow this browser to show reminder alerts',
            privacy: 'Privacy',
            dataSharing: 'Share data with my doctor',
            dataSharingHelp: 'Required to attach session results in telemedicine chat',
            analytics: 'Usage analytics',
            analyticsHelp: 'Allow DernDee to keep anonymous product improvement data',
            data: 'Your data',
            exportData: 'Export data',
            exportHelp: 'Download your profile and session history as JSON',
            deleteAccount: 'Delete account',
            deleteHelp: 'Permanently remove this account and stored records',
            about: 'About',
            version: 'App version',
            saved: 'Settings saved',
        }
        : {
            title: 'การตั้งค่า',
            subtitle: 'ค่าเหล่านี้ถูกบันทึกลงโปรไฟล์ของคุณ',
            appearance: 'การแสดงผล',
            darkMode: 'โหมดมืด',
            darkModeHelp: 'ใช้ธีมมืดทั้งแอปผู้ป่วย',
            language: 'ภาษา',
            languageHelp: 'ใช้กับวันที่และหน้าการตั้งค่านี้',
            therapy: 'การฝึก',
            stepGoal: 'เป้าหมายก้าวต่อวัน',
            stepGoalHelp: 'ใช้กับการ์ดความคืบหน้าหน้าแรก',
            notifications: 'การแจ้งเตือน',
            reminders: 'เตือนการฝึก',
            remindersHelp: 'อนุญาตให้เบราว์เซอร์นี้แสดงการแจ้งเตือน',
            privacy: 'ความเป็นส่วนตัว',
            dataSharing: 'แชร์ข้อมูลกับแพทย์',
            dataSharingHelp: 'ต้องเปิดเพื่อแนบผลเซสชันในแชทเทเลเมดิซีน',
            analytics: 'ข้อมูลการใช้งาน',
            analyticsHelp: 'อนุญาตให้เก็บข้อมูลไม่ระบุตัวตนเพื่อพัฒนาแอป',
            data: 'ข้อมูลของคุณ',
            exportData: 'ส่งออกข้อมูล',
            exportHelp: 'ดาวน์โหลดโปรไฟล์และประวัติเซสชันเป็น JSON',
            deleteAccount: 'ลบบัญชี',
            deleteHelp: 'ลบบัญชีและข้อมูลที่เก็บไว้ถาวร',
            about: 'เกี่ยวกับแอป',
            version: 'เวอร์ชันแอป',
            saved: 'บันทึกแล้ว',
        };

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
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

            <main className="p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8 pb-6 max-w-7xl mx-auto">
                <div className="bg-gradient-to-br from-white via-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 mb-4">
                    <div className="flex flex-col items-center text-center pt-6">
                        <div className="w-20 h-20 rounded-full bg-blue-100 border-4 border-white shadow-2xl flex items-center justify-center mb-4">
                            <User className="w-10 h-10 text-blue-600" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-2">{labels.title}</h1>
                        <p className="text-base sm:text-lg text-gray-600">{labels.subtitle}</p>
                        {(saving || message) && (
                            <p className="mt-3 text-sm font-semibold text-blue-700">{saving ? '...' : labels.saved}</p>
                        )}
                        {error && (
                            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p>
                        )}
                    </div>
                </div>

                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 mb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        {preferences.theme === 'dark' ? <Moon className="w-6 h-6 text-blue-600" /> : <Sun className="w-6 h-6 text-blue-600" />}
                        {labels.appearance}
                    </h3>
                    <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                        <div>
                            <div className="text-sm sm:text-base font-semibold text-gray-800">{labels.darkMode}</div>
                            <div className="text-xs sm:text-sm text-gray-600">{labels.darkModeHelp}</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={preferences.theme === 'dark'} onChange={handleThemeToggle} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full"></div>
                        </label>
                    </div>
                </div>

                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 mb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Globe className="w-6 h-6 text-blue-600" />
                        {labels.language}
                    </h3>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block">{labels.languageHelp}</label>
                    <select
                        value={preferences.language}
                        onChange={handleLanguageChange}
                        className="w-full px-4 py-2.5 rounded-xl border-2 border-blue-300 focus:border-blue-600 focus:outline-none text-sm sm:text-base text-gray-900"
                    >
                        <option value="th">ไทย (Thai)</option>
                        <option value="en">English</option>
                    </select>
                </div>

                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 mb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Target className="w-6 h-6 text-blue-600" />
                        {labels.therapy}
                    </h3>
                    <label className="text-sm font-semibold text-gray-800 block mb-2">{labels.stepGoal}</label>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={preferences.dailyStepGoal}
                        onChange={handleDailyStepGoalChange}
                        onBlur={handleDailyStepGoalBlur}
                        className="w-full px-4 py-2.5 rounded-xl border-2 border-blue-300 focus:border-blue-600 focus:outline-none text-sm sm:text-base text-gray-900"
                    />
                    <p className="mt-2 text-xs sm:text-sm text-gray-600">{labels.stepGoalHelp}</p>
                </div>

                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 mb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Bell className="w-6 h-6 text-blue-600" />
                        {labels.notifications}
                    </h3>
                    <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                        <div>
                            <div className="text-sm sm:text-base font-semibold text-gray-800">{labels.reminders}</div>
                            <div className="text-xs sm:text-sm text-gray-600">{labels.remindersHelp}</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={preferences.notifications} onChange={() => void handleNotificationsToggle()} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full"></div>
                        </label>
                    </div>
                </div>

                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 mb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Shield className="w-6 h-6 text-blue-600" />
                        {labels.privacy}
                    </h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div>
                                <div className="text-sm sm:text-base font-semibold text-gray-800">{labels.dataSharing}</div>
                                <div className="text-xs sm:text-sm text-gray-600">{labels.dataSharingHelp}</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={preferences.dataSharing} onChange={() => handleToggle('dataSharing')} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full"></div>
                            </label>
                        </div>
                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div>
                                <div className="text-sm sm:text-base font-semibold text-gray-800">{labels.analytics}</div>
                                <div className="text-xs sm:text-sm text-gray-600">{labels.analyticsHelp}</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={preferences.analytics} onChange={() => handleToggle('analytics')} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full"></div>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 mb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Download className="w-6 h-6 text-blue-600" />
                        {labels.data}
                    </h3>
                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={() => void handleExportData()}
                            disabled={exporting}
                            className="w-full flex items-center justify-between gap-4 p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors disabled:opacity-60"
                        >
                            <div className="flex items-center gap-3 text-left">
                                <Download className="w-5 h-5 text-blue-600" />
                                <div>
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">{labels.exportData}</div>
                                    <div className="text-xs sm:text-sm text-gray-600">{labels.exportHelp}</div>
                                </div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleDeleteAccount()}
                            disabled={deleting}
                            className="w-full flex items-center justify-between gap-4 p-4 bg-red-50 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-60"
                        >
                            <div className="flex items-center gap-3 text-left">
                                <Trash2 className="w-5 h-5 text-red-600" />
                                <div>
                                    <div className="text-sm sm:text-base font-semibold text-red-800">{labels.deleteAccount}</div>
                                    <div className="text-xs sm:text-sm text-red-600">{labels.deleteHelp}</div>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 mb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Info className="w-6 h-6 text-blue-600" />
                        {labels.about}
                    </h3>
                    <div className="p-4 bg-gray-50 rounded-xl flex items-center justify-between">
                        <span className="text-sm sm:text-base font-semibold text-gray-800">{labels.version}</span>
                        <span className="text-sm text-gray-600">1.0.0</span>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Settings;
