import React, { createContext, useContext, useEffect, useState } from 'react'

import { getAuthRedirectUrl, getSupabaseClient, isSupabaseConfigured } from '@shared/supabase/client.js'
import {
    fetchProfileById,
    markPatientOffline,
    normalizeAuthenticatedUser,
    upsertAuthProfile,
    upsertPatientPresence,
} from '@shared/services/profileService.js'
import { useOfflineSessionSync } from '@shared/hooks/useOfflineSessionSync.js'
import { applyUserPreferences } from '@shared/services/userPreferences.js'

const userAuthContext = createContext();
const bypassEmailConfirmationInDev = import.meta.env.DEV && import.meta.env.VITE_SUPABASE_SKIP_EMAIL_CONFIRMATION === 'true';

export function UserAuthContextProvider({ children }) {

    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const offlineSessionSync = useOfflineSessionSync({
        enabled: isSupabaseConfigured && Boolean(user?.uid),
    });

    const syncAuthenticatedUser = async (authUser) => {
        if (!authUser) {
            applyUserPreferences(null);
            setUser(null);
            setProfile(null);
            setLoading(false);
            return null;
        }

        const profileRow = await upsertAuthProfile(authUser);
        const normalizedUser = normalizeAuthenticatedUser(authUser, profileRow);
        applyUserPreferences(profileRow?.preferences);
        setProfile(profileRow);
        setUser(normalizedUser);
        setLoading(false);
        return normalizedUser;
    };

    async function refreshProfile() {
        if (!user?.uid) {
            return null;
        }

        const profileRow = await fetchProfileById(user.uid);
        applyUserPreferences(profileRow?.preferences);
        setProfile(profileRow);
        setUser((currentUser) => normalizeAuthenticatedUser({
            id: currentUser?.uid,
            email: currentUser?.email,
            user_metadata: {
                full_name: currentUser?.displayName,
                avatar_url: currentUser?.photoURL,
                role: profileRow?.role,
            },
        }, profileRow));
        return profileRow;
    }

    async function logIn(email, password) {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            throw error;
        }

        return syncAuthenticatedUser(data.user);
    }

    async function signUp(email, password) {
        if (bypassEmailConfirmationInDev) {
            const response = await fetch('/__dev/supabase/local-signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email,
                    password,
                    metadata: {
                        full_name: email.split('@')[0],
                        role: 'patient',
                    },
                }),
            });

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(payload.error || 'Local signup helper failed');
            }

            return logIn(email, password);
        }

        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: getAuthRedirectUrl('/register'),
                data: {
                    full_name: email.split('@')[0],
                    role: 'patient',
                },
            },
        });

        if (error) {
            throw error;
        }

        if (data.session?.user) {
            return syncAuthenticatedUser(data.session.user);
        }

        return data;
    }

    async function signInWithGoogle() {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: getAuthRedirectUrl('/login'),
            },
        });

        if (error) {
            throw error;
        }

        return data;
    }

    async function resendSignUpConfirmation(email) {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: getAuthRedirectUrl('/register'),
            },
        });

        if (error) {
            throw error;
        }

        return data;
    }

    async function verifyEmailOtp(email, token, type = 'signup') {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.verifyOtp({
            email,
            token,
            type,
        });

        if (error) {
            throw error;
        }

        if (data.session?.user) {
            return syncAuthenticatedUser(data.session.user);
        }

        return data;
    }

    async function requestPasswordRecovery(email) {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: getAuthRedirectUrl('/reset-password'),
        });

        if (error) {
            throw error;
        }

        return data;
    }

    async function logOut() {
        const supabase = getSupabaseClient();

        if (user?.role === 'patient') {
            await markPatientOffline(user.uid).catch(() => null);
        }

        const { error } = await supabase.auth.signOut();
        if (error) {
            throw error;
        }

        setUser(null);
        setProfile(null);
        applyUserPreferences(null);
    }

    useEffect(() => {
        if (!isSupabaseConfigured) {
            console.warn('Supabase is not configured. Authentication is disabled until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
            setLoading(false);
            return undefined;
        }

        const supabase = getSupabaseClient();
        let isMounted = true;

        const applyAuthState = async (authUser) => {
            try {
                await syncAuthenticatedUser(authUser);
            } catch (error) {
                console.error('Failed to sync authenticated user:', error);
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        const bootstrap = async () => {
            const { data, error } = await supabase.auth.getSession();
            if (error) {
                console.error('Failed to get Supabase session:', error);
                setLoading(false);
                return;
            }

            await applyAuthState(data.session?.user || null);
        };

        bootstrap();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            void applyAuthState(session?.user || null);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!user?.uid || profile?.role !== 'patient') {
            return undefined;
        }

        const heartbeat = () => {
            void upsertPatientPresence(user.uid).catch((error) => {
                console.error('Failed to update patient presence:', error);
            });
        };

        heartbeat();
        const intervalId = window.setInterval(heartbeat, 30000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                void markPatientOffline(user.uid).catch(() => null);
                return;
            }

            heartbeat();
        };

        const handleBeforeUnload = () => {
            void markPatientOffline(user.uid).catch(() => null);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            void markPatientOffline(user.uid).catch(() => null);
        };
    }, [profile?.role, user?.uid]);

    return (
        <userAuthContext.Provider value={{ 
            user, 
            profile,
            refreshProfile,
            logIn, 
            signUp, 
            logOut, 
            signInWithGoogle,
            resendSignUpConfirmation,
            verifyEmailOtp,
            requestPasswordRecovery,
            loading,
            isConfigured: isSupabaseConfigured,
            bypassEmailConfirmationInDev,
            offlineSessionSync,
        }}>
            {children}
        </userAuthContext.Provider>
    );
}

export function useUserAuth() {
    return useContext(userAuthContext);
}