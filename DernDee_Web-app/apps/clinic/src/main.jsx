import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom'

import DoctorDashboard from '@clinic/components/DoctorDashboard.jsx'
import DoctorPatientDetail from '@clinic/components/DoctorPatientDetail.jsx'
import DoctorAnalysisReview from '@clinic/components/DoctorAnalysisReview.jsx'
import DoctorChat from '@clinic/components/DoctorChat.jsx'
import DoctorLiveGaitDashboard from '@clinic/components/DoctorLiveGaitDashboard.jsx'
import { UserAuthContextProvider, useUserAuth } from '@shared/context/UserAuthContext.jsx'
import { registerDernDeePwa } from '@shared/pwa/registerPwa.js'
import '@shared/index.css'

function ClinicProtectedRoute({ children }) {
  const { user, profile, loading } = useUserAuth()

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Authenticating...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    window.location.assign('/login')
    return null
  }

  if ((profile?.role || user.role) !== 'doctor') {
    window.location.assign('/login')
    return null
  }

  return children
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <ClinicProtectedRoute><DoctorDashboard /></ClinicProtectedRoute>,
  },
  {
    path: '/chat',
    element: <ClinicProtectedRoute><DoctorChat /></ClinicProtectedRoute>,
  },
  {
    path: '/patients/:patientId',
    element: <ClinicProtectedRoute><DoctorPatientDetail /></ClinicProtectedRoute>,
  },
  {
    path: '/patients/:patientId/analysis/:sessionId',
    element: <ClinicProtectedRoute><DoctorAnalysisReview /></ClinicProtectedRoute>,
  },
  {
    path: '/live-gait/:patientId',
    element: <ClinicProtectedRoute><DoctorLiveGaitDashboard /></ClinicProtectedRoute>,
  },
], {
  basename: '/clinic',
})

registerDernDeePwa()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserAuthContextProvider>
      <RouterProvider router={router} />
    </UserAuthContextProvider>
  </React.StrictMode>,
)
