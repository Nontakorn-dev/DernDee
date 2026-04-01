import React, { createContext, useContext, useEffect, useState } from 'react'
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    signInWithPopup,
    GoogleAuthProvider
} from "firebase/auth"
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'

import { auth, db, googleProvider } from '../firebase'

const userAuthContext = createContext();

export function UserAuthContextProvider({ children }) {

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    console.log("UserAuthContext - current state - user:", user, "loading:", loading);

    // Create or update user profile in Firestore
    const createUserProfile = async (user, additionalData = {}) => {
        if (!user) return;

        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // New user - create profile
            const userProfile = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email,
                photoURL: user.photoURL || null,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
                isNewUser: true,
                // Physical therapy specific fields
                physicalTherapyData: {
                    sessions: [],
                    progress: {},
                    goals: [],
                    therapistId: null
                },
                ...additionalData
            };

            try {
                await setDoc(userRef, userProfile);
                console.log("New user profile created successfully");
            } catch (error) {
                console.error("Error creating user profile:", error);
            }
        } else {
            // Existing user - update last login
            try {
                await setDoc(userRef, {
                    lastLoginAt: serverTimestamp(),
                    isNewUser: false
                }, { merge: true });
                console.log("User profile updated successfully");
            } catch (error) {
                console.error("Error updating user profile:", error);
            }
        }
    };

    function logIn(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    }

    function signUp(email, password) {
        return createUserWithEmailAndPassword(auth, email, password);
    }

    async function signInWithGoogle() {
        console.log("UserAuthContext - signInWithGoogle - starting...");
        
        try {
            const result = await signInWithPopup(auth, googleProvider);
            console.log("UserAuthContext - signInWithGoogle - popup result:", result);
            
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const user = result.user;
            
            console.log("UserAuthContext - signInWithGoogle - user:", user);
            
            // Create or update user profile
            await createUserProfile(user);
            
            return result;
        } catch (error) {
            console.error("UserAuthContext - signInWithGoogle - error:", error);
            throw error;
        }
    }

    function logOut() {
        return signOut(auth);
    }

    useEffect(() => {
        console.log("UserAuthContext - useEffect - setting up auth listener");
        
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            console.log("Auth state changed:", currentUser);
            setUser(currentUser);
            
            if (currentUser) {
                // Update user profile on auth state change
                try {
                    await createUserProfile(currentUser);
                } catch (error) {
                    console.error("Error updating user profile:", error);
                }
            }
            
            // Always set loading to false after auth check
            console.log("UserAuthContext - setting loading to false");
            setLoading(false);
        });

        return () => {
            console.log("UserAuthContext - cleanup - removing auth listener");
            unsubscribe();
        };
    }, []);

    return (
        <userAuthContext.Provider value={{ 
            user, 
            logIn, 
            signUp, 
            logOut, 
            signInWithGoogle,
            loading 
        }}>
            {children}
        </userAuthContext.Provider>
    );
}

export function useUserAuth() {
    return useContext(userAuthContext);
}