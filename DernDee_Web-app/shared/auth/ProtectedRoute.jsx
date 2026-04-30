import React from 'react'
import { Navigate } from 'react-router-dom'
import { useUserAuth } from '../context/UserAuthContext'

function ProtectedRoute({ children, requiredRole = null }) {
    const { user, profile, loading } = useUserAuth();

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Authenticating...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" />
    }

    if (requiredRole && (profile?.role || user.role) !== requiredRole) {
        return <Navigate to={requiredRole === 'doctor' ? '/clinic' : '/home'} replace />
    }

    return children;
}

export default ProtectedRoute