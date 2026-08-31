import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import Login from '@patient/components/Login.jsx'
import Register from '@patient/components/Register.jsx'
import ResetPassword from '@patient/components/ResetPassword.jsx'
import Home from '@patient/components/Home.jsx'
import Profile from '@patient/components/Profile.jsx'
import Settings from '@patient/components/Settings.jsx'
import Calibration from '@patient/components/Calibration.jsx'
import FreeWalkSession from '@patient/components/walk/FreeWalkSession.jsx'
import WalkSummary from '@patient/components/WalkSummary.jsx'
import DeviceConnection from '@patient/components/DeviceConnection.jsx'
import TherapySelect from '@patient/components/TherapySelect.jsx'
import PatientLiveGaitMirror from '@patient/components/PatientLiveGaitMirror.jsx'
import ProtectedRoute from '@shared/auth/ProtectedRoute.jsx'
import { registerDernDeePwa } from '@shared/pwa/registerPwa.js'

import '@shared/index.css'
import { UserAuthContextProvider } from '@shared/context/UserAuthContext.jsx'
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";

const AnalysisResult = lazy(() => import('@patient/components/AnalysisResult.jsx'))
const Telemedicine = lazy(() => import('@patient/components/Telemedicine.jsx'))
const History = lazy(() => import('@patient/components/History.jsx'))
const GaitDashboard = lazy(() => import('@patient/components/GaitDashboard.jsx'))
const GameClearance = lazy(() => import('@patient/components/games/GameClearance.jsx'))
const GameBalance = lazy(() => import('@patient/components/games/GameBalance.jsx'))
const GameRhythm = lazy(() => import('@patient/components/games/GameRhythm.jsx'))
const GameSteppingStones = lazy(() => import('@patient/components/games/GameSteppingStones.jsx'))
const GameKneeFlexion = lazy(() => import('@patient/components/games/GameKneeFlexion.jsx'))
const JourneyMap = lazy(() =>
  import('@trail/components/journey/JourneyMap').then((module) => ({ default: module.JourneyMap })),
)
const PlayClient = lazy(() =>
  import('@trail/components/game/PlayClient').then((module) => ({ default: module.PlayClient })),
)

function PageFallback() {
  return <div className="min-h-screen bg-[#D7E6F2]" />
}

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
    path: "/reset-password",
    element: <ResetPassword />
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
  },
  {
    path: "/game/trail",
    element: <ProtectedRoute><JourneyMap /></ProtectedRoute>
  },
  {
    path: "/map",
    element: <ProtectedRoute><JourneyMap /></ProtectedRoute>
  },
  {
    path: "/play",
    element: <ProtectedRoute><PlayClient /></ProtectedRoute>
  }
])

registerDernDeePwa()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserAuthContextProvider>
      <PatientLiveGaitMirror />
      <Suspense fallback={<PageFallback />}>
        <RouterProvider router={router} />
      </Suspense>
    </UserAuthContextProvider>
  </React.StrictMode>,
)
