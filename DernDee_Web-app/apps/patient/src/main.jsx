import React from 'react'
import ReactDOM from 'react-dom/client'
import Login from '@patient/components/Login.jsx'
import Register from '@patient/components/Register.jsx'
import Home from '@patient/components/Home.jsx'
import Profile from '@patient/components/Profile.jsx'
import Settings from '@patient/components/Settings.jsx'
import Calibration from '@patient/components/Calibration.jsx'
import FreeWalkSession from '@patient/components/walk/FreeWalkSession.jsx'
import WalkSummary from '@patient/components/WalkSummary.jsx'
import AnalysisResult from '@patient/components/AnalysisResult.jsx'
import DeviceConnection from '@patient/components/DeviceConnection.jsx'
import Telemedicine from '@patient/components/Telemedicine.jsx'
import History from '@patient/components/History.jsx'
import TherapySelect from '@patient/components/TherapySelect.jsx'
import GaitDashboard from '@patient/components/GaitDashboard.jsx'
import PatientLiveGaitMirror from '@patient/components/PatientLiveGaitMirror.jsx'
import GameClearance from '@patient/components/games/GameClearance.jsx'
import GameBalance from '@patient/components/games/GameBalance.jsx'
import GameRhythm from '@patient/components/games/GameRhythm.jsx'
import GameSteppingStones from '@patient/components/games/GameSteppingStones.jsx'
import GameKneeFlexion from '@patient/components/games/GameKneeFlexion.jsx'
import ProtectedRoute from '@shared/auth/ProtectedRoute.jsx'
import { registerDernDeePwa } from '@shared/pwa/registerPwa.js'

import '@shared/index.css'
import { UserAuthContextProvider } from '@shared/context/UserAuthContext.jsx'
import {
  createBrowserRouter,
  Navigate,
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
    element: <ProtectedRoute><FreeWalkSession /></ProtectedRoute>
  },
  {
    path: "/free-walk",
    element: <ProtectedRoute><Navigate to="/walk-session" replace /></ProtectedRoute>
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
    path: "/gait-dashboard",
    element: <ProtectedRoute><GaitDashboard /></ProtectedRoute>
  },
  {
    path: "/clinic/gait-dashboard",
    element: <ProtectedRoute><Navigate to="/gait-dashboard" replace /></ProtectedRoute>
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
  },
  {
    path: "/game/stepping-stones",
    element: <ProtectedRoute><GameSteppingStones /></ProtectedRoute>
  },
  {
    path: "/game/knee-flexion",
    element: <ProtectedRoute><GameKneeFlexion /></ProtectedRoute>
  }
])

registerDernDeePwa()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserAuthContextProvider>
      <PatientLiveGaitMirror />
      <RouterProvider router={router} />
    </UserAuthContextProvider>
  </React.StrictMode>,
)
