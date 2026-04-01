import React from 'react'
import { Navigate } from 'react-router-dom'
import { useUserAuth } from '../context/UserAuthContext'

function ProtectedRoute({ children }) {
    const { user, loading } = useUserAuth();

    console.log("ProtectedRoute - user:", user, "loading:", loading);

    // Show loading spinner while checking authentication
    if (loading) {
        console.log("ProtectedRoute - showing loading spinner");
        return (
            <div className="loading-container">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Authenticating...</p>
                </div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!user) {
        console.log("ProtectedRoute - redirecting to login");
        return <Navigate to="/login" />
    }

    console.log("ProtectedRoute - rendering children");
    return children;
}

export default ProtectedRoute