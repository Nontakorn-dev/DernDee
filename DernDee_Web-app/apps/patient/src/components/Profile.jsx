import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@shared/firebase.js';
import './Profile.css';
import derndeeLogo from '@shared/assets/images/derndee-logo.png'; // Uncomment this line and add your logo

function Profile() {
    const { user, logOut } = useUserAuth();
    const navigate = useNavigate();
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Initialize formData with complete structure
    const [formData, setFormData] = useState({
        displayName: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        weight: '',
        height: '',
        bloodType: '',
        allergies: '',
        medicalConditions: '',
        medications: '',
        emergencyContact: {
            name: '',
            relationship: '',
            phone: ''
        },
        preferences: {
            notifications: true,
            dataSharing: false,
            language: 'en'
        }
    });

    const fileInputRef = useRef();

    useEffect(() => {
        if (user) {
            fetchUserProfile();
        }
    }, [user]);

    const fetchUserProfile = async () => {
        try {
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                setUserProfile(data);

                // Update formData with existing data
                const newFormData = {
                    displayName: data.displayName || user.displayName || '',
                    email: data.email || user.email || '',
                    phone: data.phone || '',
                    dateOfBirth: data.dateOfBirth || '',
                    weight: data.weight || '',
                    height: data.height || '',
                    bloodType: data.bloodType || '',
                    allergies: data.allergies || '',
                    medicalConditions: data.medicalConditions || '',
                    medications: data.medications || '',
                    emergencyContact: data.emergencyContact || {
                        name: '',
                        relationship: '',
                        phone: ''
                    },
                    preferences: data.preferences || {
                        notifications: true,
                        dataSharing: false,
                        language: 'en'
                    }
                };

                setFormData(newFormData);
            } else {
                // Use default values if no profile exists
                const defaultFormData = {
                    displayName: user.displayName || user.email || '',
                    email: user.email || '',
                    phone: '',
                    dateOfBirth: '',
                    weight: '',
                    height: '',
                    bloodType: '',
                    allergies: '',
                    medicalConditions: '',
                    medications: '',
                    emergencyContact: {
                        name: '',
                        relationship: '',
                        phone: ''
                    },
                    preferences: {
                        notifications: true,
                        dataSharing: false,
                        language: 'en'
                    }
                };

                setFormData(defaultFormData);
            }
        } catch (error) {
            setError('Failed to load profile data');
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setUploadingImage(true);
        setError('');

        try {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                throw new Error('Please select an image file');
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                throw new Error('Image size must be less than 5MB');
            }

            const storageRef = ref(storage, `profile-images/${user.uid}`);

            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // Update user profile with new image URL
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                photoURL: downloadURL
            });

            // Update local state
            setUserProfile(prev => ({ ...prev, photoURL: downloadURL }));
            setSuccess('Profile image updated successfully!');

            // Clear success message after 3 seconds
            setTimeout(() => setSuccess(''), 3000);

        } catch (error) {
            setError(`Failed to upload image: ${error.message}`);
        } finally {
            setUploadingImage(false);
        }
    };

    const handleInputChange = (field, value) => {
        if (field.includes('.')) {
            const [parent, child] = field.split('.');
            setFormData(prev => ({
                ...prev,
                [parent]: {
                    ...prev[parent],
                    [child]: value
                }
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [field]: value
            }));
        }
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            if (!user || !user.uid) {
                throw new Error('User not authenticated');
            }

            const userRef = doc(db, 'users', user.uid);

            // Calculate BMI if weight and height are provided
            let bmi = null;
            if (formData.weight && formData.height) {
                const weightKg = parseFloat(formData.weight);
                const heightM = parseFloat(formData.height) / 100;
                if (weightKg > 0 && heightM > 0) {
                    bmi = (weightKg / (heightM * heightM)).toFixed(1);
                }
            }

            const updateData = {
                displayName: formData.displayName || '',
                phone: formData.phone || '',
                dateOfBirth: formData.dateOfBirth || '',
                weight: formData.weight || '',
                height: formData.height || '',
                bloodType: formData.bloodType || '',
                allergies: formData.allergies || '',
                medicalConditions: formData.medicalConditions || '',
                medications: formData.medications || '',
                emergencyContact: {
                    name: formData.emergencyContact?.name || '',
                    relationship: formData.emergencyContact?.relationship || '',
                    phone: formData.emergencyContact?.phone || ''
                },
                preferences: {
                    notifications: formData.preferences?.notifications || false,
                    dataSharing: formData.preferences?.dataSharing || false,
                    language: formData.preferences?.language || 'en'
                },
                bmi: bmi,
                updatedAt: new Date()
            };

            // Add timeout to prevent infinite loading
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Save operation timed out')), 10000); // 10 seconds timeout
            });

            // Try updateDoc first, if it fails, use setDoc with merge
            try {
                await Promise.race([
                    updateDoc(userRef, updateData),
                    timeoutPromise
                ]);
                console.log('Profile updated successfully with updateDoc');
            } catch (updateError) {
                console.log('updateDoc failed, trying setDoc:', updateError.message);
                // If updateDoc fails, try setDoc with merge
                try {
                    await Promise.race([
                        setDoc(userRef, updateData, { merge: true }),
                        timeoutPromise
                    ]);
                    console.log('Profile updated successfully with setDoc');
                } catch (setDocError) {
                    throw new Error(`Both updateDoc and setDoc failed: ${setDocError.message}`);
                }
            }

            // Update local state
            setUserProfile(prev => ({ ...prev, ...updateData }));
            setIsEditing(false);
            setSuccess('Profile updated successfully!');

            // Clear success message after 3 seconds
            setTimeout(() => setSuccess(''), 3000);

        } catch (error) {
            console.error('Save error:', error);
            setError(`Failed to save profile: ${error.message}`);
            // Reset editing state on error
            setIsEditing(true);
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logOut();
            navigate('/login');
        } catch (error) {
            setError('Failed to logout');
        }
    };

    const calculateBMI = () => {
        if (formData.weight && formData.height) {
            const weightKg = parseFloat(formData.weight);
            const heightM = parseFloat(formData.height) / 100;
            if (weightKg > 0 && heightM > 0) {
                return (weightKg / (heightM * heightM)).toFixed(1);
            }
        }
        return null;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
                <div className="flex flex-col items-center gap-6">
                    <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-lg text-gray-700">Loading profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200">
            {/* Header - matching Home.jsx */}
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
                {/* Error and Success Messages */}
                {error && (
                    <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">⚠️</span>
                            <span>{error}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {error.includes('Failed to save profile') && (
                                <button
                                    onClick={handleSaveProfile}
                                    className="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
                                >
                                    Retry
                                </button>
                            )}
                            <button
                                onClick={() => setError('')}
                                className="text-red-700 hover:bg-red-100 rounded-full w-6 h-6 flex items-center justify-center font-bold"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                )}

                {success && (
                    <div className="bg-green-50 border-2 border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-center">
                        {success}
                    </div>
                )}

                {/* Profile Photo Section */}
                <div className="bg-gradient-to-br from-white via-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5 relative">
                    {/* <button
                        onClick={() => navigate('/home')}
                        className="absolute top-4 sm:top-5 md:top-6 left-4 sm:left-5 md:left-6 p-2 hover:bg-white/80 rounded-full transition-colors flex-shrink-0 z-10"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-gray-700" />
                    </button> */}
                    <div className="flex flex-col items-center text-center">
                        <div className="relative mb-4">
                            <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 xl:w-40 xl:h-40 rounded-full border-4 border-white overflow-hidden bg-white shadow-2xl relative group">
                                {userProfile?.photoURL ? (
                                    <img
                                        src={userProfile.photoURL}
                                        alt="Profile"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-blue-600 font-bold text-2xl sm:text-3xl md:text-4xl lg:text-5xl">
                                        {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                                    </div>
                                )}
                                {isEditing && (
                                    <button
                                        className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                        onClick={() => fileInputRef.current.click()}
                                        disabled={uploadingImage}
                                    >
                                        {uploadingImage ? (
                                            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-8 h-8">
                                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                                <circle cx="12" cy="13" r="4"></circle>
                                            </svg>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                        />
                        <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-800 mb-2">{formData.displayName || 'User Name'}</h2>
                        <p className="text-base sm:text-lg md:text-xl text-gray-700">{formData.email}</p>

                        {/* Edit/Save Buttons */}
                        <div className="mt-4 flex gap-3">
                            {!isEditing ? (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="bg-white text-blue-600 px-6 py-2.5 rounded-full font-semibold hover:bg-blue-50 transition-colors shadow-lg hover:shadow-xl transform hover:scale-105"
                                >
                                    Edit Profile
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => {
                                            setIsEditing(false);
                                            fetchUserProfile();
                                        }}
                                        className="bg-gray-500 text-white px-6 py-2.5 rounded-full font-semibold hover:bg-gray-600 transition-colors shadow-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={saving}
                                        className="bg-blue-600 text-white px-6 py-2.5 rounded-full font-semibold hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Personal Information */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        Personal Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        <div className="flex flex-col">
                            <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Full Name</label>
                            <input
                                type="text"
                                value={formData.displayName}
                                onChange={(e) => handleInputChange('displayName', e.target.value)}
                                disabled={!isEditing}
                                placeholder="Enter your full name"
                                className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base ${formData.displayName ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                    }`}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Phone Number</label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => handleInputChange('phone', e.target.value)}
                                disabled={!isEditing}
                                placeholder="Enter your phone number"
                                className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base ${formData.phone ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                    }`}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Date of Birth</label>
                            <input
                                type="date"
                                value={formData.dateOfBirth}
                                onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                                disabled={!isEditing}
                                className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base ${formData.dateOfBirth ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                    }`}
                            />
                        </div>
                    </div>
                </div>

                {/* Medical Information */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
                        </svg>
                        Medical Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        <div className="flex flex-col">
                            <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Weight (kg)</label>
                            <input
                                type="number"
                                value={formData.weight}
                                onChange={(e) => handleInputChange('weight', e.target.value)}
                                disabled={!isEditing}
                                placeholder="Enter weight"
                                min="0"
                                step="0.1"
                                className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base ${formData.weight ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                    }`}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Height (cm)</label>
                            <input
                                type="number"
                                value={formData.height}
                                onChange={(e) => handleInputChange('height', e.target.value)}
                                disabled={!isEditing}
                                placeholder="Enter height"
                                min="0"
                                step="0.1"
                                className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base ${formData.height ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                    }`}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Blood Type</label>
                            <select
                                value={formData.bloodType}
                                onChange={(e) => handleInputChange('bloodType', e.target.value)}
                                disabled={!isEditing}
                                className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base ${formData.bloodType ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                    }`}
                            >
                                <option value="">Select blood type</option>
                                <option value="A+">A+</option>
                                <option value="A-">A-</option>
                                <option value="B+">B+</option>
                                <option value="B-">B-</option>
                                <option value="AB+">AB+</option>
                                <option value="AB-">AB-</option>
                                <option value="O+">O+</option>
                                <option value="O-">O-</option>
                            </select>
                        </div>
                        {calculateBMI() && (
                            <div className="flex flex-col">
                                <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">BMI</label>
                                <div className="px-4 py-3 rounded-xl bg-white border-2 border-gray-200">
                                    <span className="text-2xl sm:text-3xl font-bold text-gray-900 mr-2">{calculateBMI()}</span>
                                    <span className="text-sm sm:text-base text-gray-600">
                                        {calculateBMI() < 18.5 ? 'Underweight' :
                                            calculateBMI() < 25 ? 'Normal' :
                                                calculateBMI() < 30 ? 'Overweight' : 'Obese'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col mt-4">
                        <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Allergies</label>
                        <textarea
                            value={formData.allergies}
                            onChange={(e) => handleInputChange('allergies', e.target.value)}
                            disabled={!isEditing}
                            placeholder="List any allergies (e.g., peanuts, penicillin)"
                            rows="3"
                            className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base resize-none ${formData.allergies ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                }`}
                        />
                    </div>
                    <div className="flex flex-col mt-4">
                        <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Medical Conditions</label>
                        <textarea
                            value={formData.medicalConditions}
                            onChange={(e) => handleInputChange('medicalConditions', e.target.value)}
                            disabled={!isEditing}
                            placeholder="List any medical conditions"
                            rows="3"
                            className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base resize-none ${formData.medicalConditions ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                }`}
                        />
                    </div>
                    <div className="flex flex-col mt-4">
                        <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Current Medications</label>
                        <textarea
                            value={formData.medications}
                            onChange={(e) => handleInputChange('medications', e.target.value)}
                            disabled={!isEditing}
                            placeholder="List current medications and dosages"
                            rows="3"
                            className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base resize-none ${formData.medications ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                }`}
                        />
                    </div>
                </div>

                {/* Emergency Contact */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        Emergency Contact
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        <div className="flex flex-col">
                            <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Contact Name</label>
                            <input
                                type="text"
                                value={formData.emergencyContact?.name || ''}
                                onChange={(e) => handleInputChange('emergencyContact.name', e.target.value)}
                                disabled={!isEditing}
                                placeholder="Emergency contact name"
                                className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base ${formData.emergencyContact?.name ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                    }`}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Relationship</label>
                            <input
                                type="text"
                                value={formData.emergencyContact?.relationship || ''}
                                onChange={(e) => handleInputChange('emergencyContact.relationship', e.target.value)}
                                disabled={!isEditing}
                                placeholder="e.g., Spouse, Parent"
                                className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base ${formData.emergencyContact?.relationship ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                    }`}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm sm:text-base font-semibold text-gray-700 mb-2">Phone Number</label>
                            <input
                                type="tel"
                                value={formData.emergencyContact?.phone || ''}
                                onChange={(e) => handleInputChange('emergencyContact.phone', e.target.value)}
                                disabled={!isEditing}
                                placeholder="Emergency contact phone"
                                className={`px-4 py-2.5 rounded-xl border-2 focus:border-blue-600 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm sm:text-base ${formData.emergencyContact?.phone ? 'border-blue-400 text-gray-900 font-medium' : 'border-blue-300 text-gray-600'
                                    }`}
                            />
                        </div>
                    </div>
                </div>

                {/* Preferences */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                        Preferences
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.preferences?.notifications || false}
                                    onChange={(e) => handleInputChange('preferences.notifications', e.target.checked)}
                                    disabled={!isEditing}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                            <div className="flex-1">
                                <div className="text-sm sm:text-base font-semibold text-gray-800">Push Notifications</div>
                                <div className="text-xs sm:text-sm text-gray-600">Receive alerts about your therapy sessions</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.preferences?.dataSharing || false}
                                    onChange={(e) => handleInputChange('preferences.dataSharing', e.target.checked)}
                                    disabled={!isEditing}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                            <div className="flex-1">
                                <div className="text-sm sm:text-base font-semibold text-gray-800">Data Sharing</div>
                                <div className="text-xs sm:text-sm text-gray-600">Share data with your healthcare providers</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Account Actions */}
                <div className="bg-white border-2 border-blue-100 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 mb-3 sm:mb-4 md:mb-5">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16,17 21,12 16,7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        Account
                    </h3>
                    <div className="flex justify-center">
                        <button
                            onClick={handleLogout}
                            className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full font-semibold transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center gap-2"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16,17 21,12 16,7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                            Sign Out
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default Profile; 