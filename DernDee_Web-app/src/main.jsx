import React from 'react'
import ReactDOM from 'react-dom/client'
import Login from './components/Login.jsx'
import Register from './components/Register.jsx'
import Home from './components/Home.jsx'
import Profile from './components/Profile.jsx'
import Settings from './components/Settings.jsx'
import Position from './components/Position.jsx'
import Calibration from './components/Calibration.jsx'
import WalkSession from './components/WalkSession.jsx'
import WalkSummary from './components/WalkSummary.jsx'
import AnalysisResult from './components/AnalysisResult.jsx'
import DeviceConnection from './components/DeviceConnection.jsx'
import Telemedicine from './components/Telemedicine.jsx'
import History from './components/History.jsx'
import TherapySelect from './components/TherapySelect.jsx'
import GameClearance from './components/games/GameClearance.jsx'
import GameBalance from './components/games/GameBalance.jsx'
import GameRhythm from './components/games/GameRhythm.jsx'
import DoctorDashboard from './components/doctor/DoctorDashboard.jsx'
import DoctorPatientDetail from './components/doctor/DoctorPatientDetail.jsx'
import DoctorAnalysisReview from './components/doctor/DoctorAnalysisReview.jsx'
import DoctorChat from './components/doctor/DoctorChat.jsx'
import ProtectedRoute from './auth/ProtectedRoute.jsx'

import './index.css'
import { UserAuthContextProvider } from './context/UserAuthContext.jsx'
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Login />
  },
  {
    path: "/login",
    element: <Login />
  },
  {
    path: "/register",
    element: <Register />
  },
  {
    path: "/home",
    element: <ProtectedRoute><Home /></ProtectedRoute>
  },
  {
    path: "/profile",
    element: <ProtectedRoute><Profile /></ProtectedRoute>
  },
  {
    path: "/settings",
    element: <ProtectedRoute><Settings /></ProtectedRoute>
  },
  {
    path: "/therapy",
    element: <ProtectedRoute><TherapySelect /></ProtectedRoute>
  },
  {
    path: "/calibration",
    element: <ProtectedRoute><Calibration /></ProtectedRoute>
  },
  {
    path: "/walk-session",
    element: <ProtectedRoute><WalkSession /></ProtectedRoute>
  },
  {
    path: "/walk-summary",
    element: <ProtectedRoute><WalkSummary /></ProtectedRoute>
  },
  {
    path: "/analysis-result",
    element: <ProtectedRoute><AnalysisResult /></ProtectedRoute>
  },
  {
    path: "/device-connection",
    element: <ProtectedRoute><DeviceConnection /></ProtectedRoute>
  },
  {
    path: "/telemedicine",
    element: <ProtectedRoute><Telemedicine /></ProtectedRoute>
  },
  {
    path: "/history",
    element: <ProtectedRoute><History /></ProtectedRoute>
  },
  {
    path: "/doctor",
    element: <ProtectedRoute><DoctorDashboard /></ProtectedRoute>
  },
  {
    path: "/doctor/chat",
    element: <ProtectedRoute><DoctorChat /></ProtectedRoute>
  },
  {
    path: "/doctor/patients/:patientId",
    element: <ProtectedRoute><DoctorPatientDetail /></ProtectedRoute>
  },
  {
    path: "/doctor/patients/:patientId/analysis/:sessionId",
    element: <ProtectedRoute><DoctorAnalysisReview /></ProtectedRoute>
  },
  {
    path: "/game/clearance",
    element: <ProtectedRoute><GameClearance /></ProtectedRoute>
  },
  {
    path: "/game/balance",
    element: <ProtectedRoute><GameBalance /></ProtectedRoute>
  },
  {
    path: "/game/rhythm",
    element: <ProtectedRoute><GameRhythm /></ProtectedRoute>
  }
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserAuthContextProvider>
      <RouterProvider router={router} />
    </UserAuthContextProvider>
  </React.StrictMode>,
)
