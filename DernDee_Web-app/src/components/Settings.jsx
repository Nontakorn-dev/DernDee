import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Globe, Bell, Shield, Info, HelpCircle, Trash2, Download, Lock, Clock, User } from 'lucide-react';
import derndeeLogo from '../assets/images/derndee-logo.png';

const Settings = () => {
    const navigate = useNavigate();
    const [darkMode, setDarkMode] = useState(false);
    const [language, setLanguage] = useState('th');
    const [notifications, setNotifications] = useState({
        push: true,
        email: true,
        sms: false,
        reminders: true
    });
    const [privacy, setPrivacy] = useState({
        dataSharing: false,
        analytics: true,
        publicProfile: false
    });

    const handleDarkModeToggle = () => {
        setDarkMode(!darkMode);
        // Here you would typically implement actual dark mode logic
        if (!darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    const handleLanguageChange = (e) => {
        setLanguage(e.target.value);
    };

    const handleNotificationChange = (key) => {
        setNotifications(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const handlePrivacyChange = (key) => {
        setPrivacy(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const handleDeleteAccount = () => {
        if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
            // Implement account deletion logic
            console.log('Account deletion requested');
        }
    };

    const handleExportData = () => {
        // Implement data export logic
        console.log('Data export requested');
    };

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
            <main className="p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8 pb-6 max-w-7xl mx-auto">
                {/* Settings Header Card */}
                <div className="bg-gradient-to-br from-white via-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5 relative">
                    {/* <button
                        onClick={() => navigate('/home')}
                        className="absolute top-4 sm:top-5 md:top-6 left-4 sm:left-5 md:left-6 p-2 hover:bg-white/80 rounded-full transition-colors flex-shrink-0 z-10"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-gray-700" />
                    </button> */}
                    <div className="flex flex-col items-center text-center pt-8 sm:pt-10 md:pt-12">
                        <div className="mb-4 sm:mb-5">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-blue-100 border-4 border-white shadow-2xl flex items-center justify-center">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600 w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                            </div>
                        </div>
                        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-800 mb-2">
                            Settings
                        </h1>
                        <p className="text-base sm:text-lg md:text-xl text-gray-600">
                            จัดการการตั้งค่าของคุณ
                        </p>
                    </div>
                </div>

                {/* Appearance Settings */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        {darkMode ? (
                            <Moon className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                        ) : (
                            <Sun className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                        )}
                        Appearance
                    </h3>
                    <div className="space-y-4 sm:space-y-5">
                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3 sm:gap-4">
                                {darkMode ? (
                                    <Moon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                                ) : (
                                    <Sun className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                                )}
                                <div className="flex-1">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">Dark Mode</div>
                                    <div className="text-xs sm:text-sm text-gray-600">เปลี่ยนเป็นโหมดมืดเพื่อลดแสงจ้า</div>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={darkMode}
                                    onChange={handleDarkModeToggle}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Language Settings */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <Globe className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                        Language
                    </h3>
                    <div className="flex flex-col">
                        <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">ภาษา</label>
                        <select
                            value={language}
                            onChange={handleLanguageChange}
                            className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none text-sm sm:text-base ${language ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                }`}
                        >
                            <option value="th">ไทย (Thai)</option>
                            <option value="en">English</option>
                            <option value="zh">中文 (Chinese)</option>
                            <option value="ja">日本語 (Japanese)</option>
                        </select>
                    </div>
                </div>

                {/* Notifications Settings */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <Bell className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                        Notifications
                    </h3>
                    <div className="space-y-4 sm:space-y-5">
                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                                <div className="flex-1">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">Push Notifications</div>
                                    <div className="text-xs sm:text-sm text-gray-600">รับการแจ้งเตือนผ่านแอปพลิเคชัน</div>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={notifications.push}
                                    onChange={() => handleNotificationChange('push')}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                                <div className="flex-1">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">Email Notifications</div>
                                    <div className="text-xs sm:text-sm text-gray-600">รับการแจ้งเตือนผ่านอีเมล</div>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={notifications.email}
                                    onChange={() => handleNotificationChange('email')}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                </svg>
                                <div className="flex-1">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">SMS Notifications</div>
                                    <div className="text-xs sm:text-sm text-gray-600">รับการแจ้งเตือนผ่านข้อความ</div>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={notifications.sms}
                                    onChange={() => handleNotificationChange('sms')}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                                <div className="flex-1">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">Reminders</div>
                                    <div className="text-xs sm:text-sm text-gray-600">รับการแจ้งเตือนการเตือนความจำ</div>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={notifications.reminders}
                                    onChange={() => handleNotificationChange('reminders')}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Privacy & Security */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <Shield className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                        Privacy & Security
                    </h3>
                    <div className="space-y-4 sm:space-y-5">
                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                                <div className="flex-1">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">Data Sharing</div>
                                    <div className="text-xs sm:text-sm text-gray-600">แชร์ข้อมูลกับผู้ให้บริการด้านสุขภาพ</div>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={privacy.dataSharing}
                                    onChange={() => handlePrivacyChange('dataSharing')}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600">
                                    <line x1="12" y1="1" x2="12" y2="23"></line>
                                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                </svg>
                                <div className="flex-1">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">Analytics</div>
                                    <div className="text-xs sm:text-sm text-gray-600">อนุญาตให้ใช้ข้อมูลเพื่อปรับปรุงแอป</div>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={privacy.analytics}
                                    onChange={() => handlePrivacyChange('analytics')}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <User className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                                <div className="flex-1">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">Public Profile</div>
                                    <div className="text-xs sm:text-sm text-gray-600">เปิดให้ผู้อื่นเห็นโปรไฟล์ของคุณ</div>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={privacy.publicProfile}
                                    onChange={() => handlePrivacyChange('publicProfile')}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Data Management */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <Download className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                        Data Management
                    </h3>
                    <div className="space-y-4 sm:space-y-5">
                        <button
                            onClick={handleExportData}
                            className="w-full flex items-center justify-between gap-4 p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                        >
                            <div className="flex items-center gap-3 sm:gap-4">
                                <Download className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                                <div className="text-left">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">Export Data</div>
                                    <div className="text-xs sm:text-sm text-gray-600">ดาวน์โหลดข้อมูลของคุณ</div>
                                </div>
                            </div>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>

                        <button
                            onClick={handleDeleteAccount}
                            className="w-full flex items-center justify-between gap-4 p-4 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                        >
                            <div className="flex items-center gap-3 sm:gap-4">
                                <Trash2 className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
                                <div className="text-left">
                                    <div className="text-sm sm:text-base font-semibold text-red-800">Delete Account</div>
                                    <div className="text-xs sm:text-sm text-red-600">ลบบัญชีและข้อมูลทั้งหมด</div>
                                </div>
                            </div>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-600">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* About & Help */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <Info className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                        About & Help
                    </h3>
                    <div className="space-y-4 sm:space-y-5">
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="text-sm sm:text-base font-semibold text-gray-800 mb-2">App Version</div>
                            <div className="text-xs sm:text-sm text-gray-600">1.0.0</div>
                        </div>

                        <button
                            onClick={() => {/* Navigate to help page */ }}
                            className="w-full flex items-center justify-between gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <div className="flex items-center gap-3 sm:gap-4">
                                <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                                <div className="text-left">
                                    <div className="text-sm sm:text-base font-semibold text-gray-800">Help & Support</div>
                                    <div className="text-xs sm:text-sm text-gray-600">คำถามที่พบบ่อยและติดต่อฝ่ายสนับสนุน</div>
                                </div>
                            </div>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>

                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="text-sm sm:text-base font-semibold text-gray-800 mb-2">Terms of Service</div>
                            <div className="text-xs sm:text-sm text-gray-600">เงื่อนไขการใช้งาน</div>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="text-sm sm:text-base font-semibold text-gray-800 mb-2">Privacy Policy</div>
                            <div className="text-xs sm:text-sm text-gray-600">นโยบายความเป็นส่วนตัว</div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Settings;

