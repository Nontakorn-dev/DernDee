import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '../context/UserAuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
// Import Home icon as HomeIcon to avoid naming conflict with component
import { Home as HomeIcon, User, Settings, Bluetooth, Clock, TrendingUp, Video, Menu, Bell, LogOut, Upload } from 'lucide-react';
import derndeeLogo from '../assets/images/derndee-logo.png';
import doctorImageSrc from '../assets/images/doctor.png';

const Home = () => {
    const { logOut, user } = useUserAuth();
    const navigate = useNavigate();
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const [connectedDevices, setConnectedDevices] = useState([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileImage, setProfileImage] = useState(null);
    const [stepsProgress, setStepsProgress] = useState({ current: 400, target: 500 });
    // ใช้ imported image หรือสามารถกำหนดเป็น path อื่นได้
    const [doctorImage, setDoctorImage] = useState(doctorImageSrc);

    useEffect(() => {
        const fetchUserProfile = async () => {
            if (user) {
                try {
                    const userRef = doc(db, 'users', user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        setUserProfile(data);
                        // If profile has steps data, use it
                        if (data.steps) {
                            setStepsProgress({ current: data.steps.current || 400, target: data.steps.target || 500 });
                        }
                    }
                } catch (error) {
                    console.error("Error fetching user profile:", error);
                } finally {
                    setLoading(false);
                }
            }
        };

        fetchUserProfile();
    }, [user]);

    // Update connection status when connectedDevices changes
    useEffect(() => {
        setIsConnected(connectedDevices.length > 0);
    }, [connectedDevices]);

    const handleLogout = async () => {
        try {
            await logOut();
            navigate('/');
        } catch (err) {
            console.log(err.message);
        }
    };

    const handleConnectDevice = () => {
        navigate('/device-connection');
    };


    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfileImage(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    // Get initials for avatar placeholder
    const getInitials = () => {
        const name = user?.displayName || 'Nontakorn Pulakkeaw';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const stepsPercentage = Math.min((stepsProgress.current / stepsProgress.target) * 100, 100);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="flex flex-col items-center gap-6">
                    <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-lg text-gray-700">Loading your profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header */}
            <header className="bg-white shadow-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <img src={derndeeLogo} alt="DernDee" className="h-8 sm:h-10 md:h-12 object-contain" />
                </div>
            </header>

            {/* Main Content */}
            <main className="p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8 pb-6 max-w-7xl mx-auto">
                <div className="lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
                    {/* LEFT COLUMN (Profile + Therapy) - Desktop: Span 9/12 */}
                    <div className="col-span-12 lg:col-span-9 flex flex-col gap-4 lg:gap-8 h-full">

                        {/* Profile Card */}
                        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8">
                            <div className="flex items-start justify-between mb-3 sm:mb-4 md:mb-5 gap-3 sm:gap-4">
                                <div className="flex items-center gap-3 sm:gap-4 md:gap-5 flex-1 min-w-0">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 xl:w-32 xl:h-32 rounded-full border-2 sm:border-3 md:border-4 border-blue-400 overflow-hidden bg-blue-100 shadow-lg relative group cursor-pointer flex-shrink-0">
                                        {profileImage || user?.photoURL ? (
                                            <img
                                                src={profileImage || user.photoURL}
                                                alt="Profile"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-blue-600 font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl">
                                                {getInitials()}
                                            </div>
                                        )}
                                        <label className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <Upload className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 text-white" />
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageUpload}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>
                                    <div className="flex flex-col gap-1.5 sm:gap-2 md:gap-3 min-w-0 flex-1">
                                        <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-gray-800 break-words leading-tight">
                                            {user?.displayName || 'Nontakorn Pulakkeaw'}
                                        </h2>
                                        <button
                                            onClick={handleLogout}
                                            className="bg-blue-500 text-white px-3 sm:px-4 md:px-5 lg:px-6 xl:px-7 py-1.5 sm:py-2 md:py-2.5 lg:py-3 rounded-full flex items-center gap-1.5 sm:gap-2 md:gap-2.5 font-semibold hover:bg-blue-600 transition-colors shadow-lg w-fit text-sm sm:text-base md:text-lg lg:text-xl"
                                        >
                                            <LogOut className="w-4 h-4 sm:w-5 sm:h-5 md:w-5 md:h-5 lg:w-6 lg:h-6" />
                                            Sign Out
                                        </button>
                                    </div>
                                </div>
                                <div className="relative flex-shrink-0">
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 bg-blue-100 rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:bg-blue-200 transition-colors">
                                        <Bell className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 text-blue-500" />
                                        <div className="absolute top-0 right-0 w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 bg-red-500 rounded-full border-2 border-white"></div>
                                    </div>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="mt-3 sm:mt-4 md:mt-5 lg:mt-6">
                                <div className="flex justify-between items-center mb-2 sm:mb-3 flex-wrap gap-2">
                                    <span className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-semibold text-gray-700">Today's walk</span>
                                    <span className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-gray-800">
                                        {stepsProgress.current} / {stepsProgress.target} Steps
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5 sm:h-3 md:h-3.5 lg:h-4 overflow-hidden shadow-inner">
                                    <div
                                        className="bg-gradient-to-r from-blue-400 to-blue-500 h-full rounded-full shadow-md transition-all duration-500"
                                        style={{ width: `${stepsPercentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        {/* Therapy Card */}
                        <div className="bg-gradient-to-br from-blue-200 via-blue-300 to-blue-400 rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-5 md:p-6 lg:p-7 xl:p-8 relative overflow-hidden min-h-[200px] sm:min-h-[220px] md:min-h-[240px] lg:min-h-[260px] xl:min-h-[300px] cursor-pointer flex items-center"
                            onClick={() => navigate('/therapy')}>
                            <div className="relative z-10 max-w-[55%] sm:max-w-[50%] md:max-w-[45%] lg:max-w-[40%]">
                                <h3 className="text-4xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-gray-800 mb-2 sm:mb-2 md:mb-2.5 drop-shadow-md">
                                    Therapy
                                </h3>
                                <p className="text-lg sm:text-base md:text-lg lg:text-xl xl:text-2xl text-gray-700 mb-3 sm:mb-3 md:mb-4 font-medium drop-shadow-sm">
                                    กายภาพบำบัดเรียลไทม์
                                </p>
                                <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 sm:px-4 md:px-5 lg:px-8 xl:px-10 py-2.5 sm:py-2 md:py-2.5 lg:py-3.5 xl:py-4 rounded-full text-base sm:text-sm md:text-base lg:text-xl xl:text-2xl font-bold hover:scale-105 transition-all duration-300 shadow-xl hover:shadow-2xl">
                                    Start Therapy
                                </button>
                            </div>
                            <div className="absolute right-0 bottom-0 flex items-end justify-end z-0">
                                {doctorImage ? (
                                    <img
                                        src={doctorImage}
                                        alt="Doctor"
                                        className="w-40 h-40 sm:w-44 sm:h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 xl:w-80 xl:h-80 object-contain translate-y-4"
                                        onError={() => setDoctorImage(null)}
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="text-7xl sm:text-7xl md:text-9xl lg:text-[10rem] xl:text-[12rem]">👨‍⚕️</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN (Features Stack) - Desktop: Span 3/12 */}
                    <div className="col-span-12 lg:col-span-3 grid grid-cols-2 md:grid-cols-4 lg:flex lg:flex-col gap-4 sm:gap-3 md:gap-4 lg:gap-5 mt-4 lg:mt-0 h-full">
                        {/* Connected */}
                        <div
                            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-4 md:p-4 lg:p-4 flex flex-col items-center justify-center flex-1 min-h-[100px] sm:min-h-[120px] md:min-h-[140px] lg:min-h-[120px] xl:min-h-[140px] hover:shadow-3xl transition-shadow cursor-pointer"
                            onClick={handleConnectDevice}
                        >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-14 lg:h-14 xl:w-16 xl:h-16 bg-blue-100 rounded-full flex items-center justify-center mb-2 sm:mb-2 md:mb-3 shadow-lg">
                                <Bluetooth className={`w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-7 lg:h-7 xl:w-8 xl:h-8 ${isConnected ? 'text-blue-500' : 'text-gray-400'}`} />
                            </div>
                            <h4 className="text-xs sm:text-sm md:text-base lg:text-base xl:text-lg font-bold text-gray-800 text-center">Connected</h4>
                            {connectedDevices.length > 0 && (
                                <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{connectedDevices.length} device(s)</p>
                            )}
                        </div>

                        {/* History */}
                        <div
                            onClick={() => navigate('/history')}
                            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-4 md:p-4 lg:p-4 flex flex-col items-center justify-center flex-1 min-h-[100px] sm:min-h-[120px] md:min-h-[140px] lg:min-h-[120px] xl:min-h-[140px] hover:shadow-3xl transition-shadow cursor-pointer"
                        >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-14 lg:h-14 xl:w-16 xl:h-16 bg-green-100 rounded-full flex items-center justify-center mb-2 sm:mb-2 md:mb-3 shadow-lg">
                                <Clock className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-7 lg:h-7 xl:w-8 xl:h-8 text-green-500" />
                            </div>
                            <h4 className="text-xs sm:text-sm md:text-base lg:text-base xl:text-lg font-bold text-gray-800 text-center">History</h4>
                        </div>

                        {/* Analysis Result */}
                        <div
                            onClick={() => navigate('/analysis-result')}
                            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-4 md:p-4 lg:p-4 flex flex-col items-center justify-center flex-1 min-h-[100px] sm:min-h-[120px] md:min-h-[140px] lg:min-h-[120px] xl:min-h-[140px] hover:shadow-3xl transition-shadow cursor-pointer"
                        >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-14 lg:h-14 xl:w-16 xl:h-16 bg-purple-100 rounded-full flex items-center justify-center mb-2 sm:mb-2 md:mb-3 shadow-lg">
                                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-7 lg:h-7 xl:w-8 xl:h-8 text-purple-500" />
                            </div>
                            <h4 className="text-xs sm:text-sm md:text-base lg:text-base xl:text-lg font-bold text-gray-800 text-center">Analysis Result</h4>
                        </div>

                        {/* Telemedicine */}
                        <div
                            onClick={() => navigate('/telemedicine')}
                            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-4 md:p-4 lg:p-4 flex flex-col items-center justify-center flex-1 min-h-[100px] sm:min-h-[120px] md:min-h-[140px] lg:min-h-[120px] xl:min-h-[140px] hover:shadow-3xl transition-shadow cursor-pointer"
                        >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-14 lg:h-14 xl:w-16 xl:h-16 bg-orange-100 rounded-full flex items-center justify-center mb-2 sm:mb-2 md:mb-3 shadow-lg">
                                <Video className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-7 lg:h-7 xl:w-8 xl:h-8 text-orange-500" />
                            </div>
                            <h4 className="text-xs sm:text-sm md:text-base lg:text-base xl:text-lg font-bold text-gray-800 text-center">Telemedicine</h4>
                        </div>
                    </div>
                </div>

                {/* Bottom Navigation */}
                <nav className="mt-4 sm:mt-5 md:mt-6 lg:mt-8 bg-white shadow-lg rounded-2xl sm:rounded-3xl mx-2 sm:mx-3 md:mx-4 mb-2 sm:mb-3 md:mb-4 lg:mx-0">
                    <div className="flex items-center justify-around py-2 sm:py-3 md:py-4 px-3 sm:px-4 md:px-5 lg:px-6">
                        <button
                            onClick={() => navigate('/profile')}
                            className="flex flex-col items-center gap-0.5 sm:gap-1 text-gray-400 hover:text-gray-800 transition-colors"
                        >
                            <User className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
                            <span className="text-xs sm:text-sm md:text-base font-medium">Profile</span>
                        </button>

                        <button
                            className="flex flex-col items-center gap-0.5 sm:gap-1 text-blue-500"
                        >
                            <HomeIcon className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
                            <span className="text-xs sm:text-sm md:text-base font-medium">Home</span>
                        </button>

                        <button
                            onClick={() => navigate('/settings')}
                            className="flex flex-col items-center gap-0.5 sm:gap-1 text-gray-400 hover:text-gray-800 transition-colors"
                        >
                            <Settings className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
                            <span className="text-xs sm:text-sm md:text-base font-medium">Settings</span>
                        </button>
                    </div>
                </nav>
            </main>

        </div>
    );
};

export default Home;
