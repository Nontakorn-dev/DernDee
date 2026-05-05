import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useUserAuth } from '@shared/context/UserAuthContext.jsx'
import { createGaitLabDashboardApp } from '@shared/gait-dashboard/app.js'
import dashboardCssText from '@shared/gait-dashboard/styles/main.css?inline'
import derndeeLogo from '@shared/assets/images/derndee-logo.png'
import { createLiveGaitBroadcastStreamClient } from '@shared/services/liveGaitBroadcast.js'
import { fetchDoctorPatientDetail } from '@shared/services/sessionService.js'

const DoctorLiveGaitDashboard = () => {
  const navigate = useNavigate()
  const { patientId } = useParams()
  const { user } = useUserAuth()
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadPatient = async () => {
      if (!user?.uid || !patientId) {
        if (isMounted) {
          setLoading(false)
        }
        return
      }

      try {
        const detail = await fetchDoctorPatientDetail(user.uid, patientId)

        if (!isMounted) {
          return
        }

        setPatient(detail.patient)
        setError('')
      } catch (loadError) {
        if (!isMounted) {
          return
        }

        setPatient(null)
        setError(loadError.message || 'Unable to load patient live dashboard')
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadPatient()

    return () => {
      isMounted = false
    }
  }, [patientId, user?.uid])

  useEffect(() => {
    if (!patient?.id) {
      return undefined
    }

    const styleElement = document.createElement('style')
    styleElement.setAttribute('data-gait-dashboard-ui', 'doctor-live')
    styleElement.textContent = dashboardCssText
    document.head.appendChild(styleElement)

    const app = createGaitLabDashboardApp({
      teardownTransportOnDestroy: false,
      initialMode: 'remote-broadcast',
      streamFactory: () => createLiveGaitBroadcastStreamClient({
        patientId: patient.id,
        viewerId: user?.uid,
      }),
    })

    app.init()

    return () => {
      app.destroy()
      styleElement.remove()
    }
  }, [patient?.id, user?.uid])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-700 text-lg font-semibold">Loading live gait dashboard...</p>
        </div>
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 flex items-center justify-center px-6">
        <div className="max-w-xl rounded-3xl border-2 border-red-200 bg-white p-8 text-center shadow-xl">
          <h1 className="text-2xl font-extrabold text-gray-900">Live Dashboard Unavailable</h1>
          <p className="mt-3 text-sm text-gray-600">{error || 'The selected patient could not be loaded.'}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:bg-blue-700"
          >
            Back to Doctor Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div id="loading-overlay" className="loading-overlay">
        <div className="loading-spinner"></div>
        <div className="loading-text">Connecting to patient live stream...</div>
      </div>

      <header className="header">
        <div className="header-brand" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img
            src={derndeeLogo}
            alt="DernDee Logo"
            style={{ height: '44px', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
          />
          <div style={{ height: '32px', width: '2px', background: '#e2e8f0', borderRadius: '4px' }}></div>
          <div>
            <div
              className="header-title"
              style={{ fontWeight: 800, fontSize: '1.5rem', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}
            >
              Doctor Live DashboardTTTT
            </div>
            <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>
              {patient.name} ({patient.patientId})
            </div>
          </div>
        </div>

        <div className="header-controls">
          <button className="btn" type="button" onClick={() => navigate(`/patients/${patient.id}`)}>
            ← Patient
          </button>

          <div className="connection-status">
            <div className="status-indicator" id="status-indicator"></div>
            <span id="status-text">Connecting...</span>
          </div>

          <div className="btn" aria-hidden="true">
            <span className="mode-toggle-dot" id="mode-dot"></span>
            <span id="mode-label">Remote Live</span>
          </div>
        </div>
      </header>

      <main className="main-container">
        <div className="dashboard-grid">
          <div className="charts-area">
            <div className="card fade-in-up">
              <div className="card-header">
                <div className="card-title">📈 Angular Velocity (Sagittal)</div>
                <span className="card-badge">gx axis</span>
              </div>
              <div className="chart-container">
                <canvas id="chart-angvel"></canvas>
              </div>
            </div>

            <div className="card fade-in-up">
              <div className="card-header">
                <div className="card-title">📐 Shank Angle (Kalman Filter)</div>
                <span className="card-badge">sensor fusion</span>
              </div>
              <div className="chart-container">
                <canvas id="chart-angle"></canvas>
              </div>
            </div>
          </div>

          <div className="params-panel fade-in-up">
            <div className="section-card stats-card">
              <div className="section-title">📊 Statistics</div>
              <div className="stat-row stat-row-highlight">
                <span className="stat-label">🦶 Step Count:</span>
                <span className="stat-value stat-value-lg" id="val-step-count">0</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Stride Count:</span>
                <span className="stat-value" id="val-stride-count">0</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Session Duration:</span>
                <div>
                  <span className="stat-value" id="val-session-duration">0.0</span>
                  <span className="stat-unit">s</span>
                </div>
              </div>
            </div>

            <div className="section-card">
              <div className="section-title">⏱️ Temporal Parameters</div>
              <div className="stat-row">
                <span className="stat-label">Cadence:</span>
                <div>
                  <span className="stat-value" id="val-cadence">—</span>
                  <span className="stat-unit">steps/min</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-label">Step Time:</span>
                <div>
                  <span className="stat-value" id="val-step-time">—</span>
                  <span className="stat-unit">s</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-label">Stride Time:</span>
                <div>
                  <span className="stat-value" id="val-stride-time">—</span>
                  <span className="stat-unit">s</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-label">Double Support:</span>
                <div>
                  <span className="stat-value" id="val-double-support">—</span>
                  <span className="stat-unit">s</span>
                </div>
              </div>
            </div>

            <div className="section-card">
              <div className="section-title">📏 Spatial Parameters</div>
              <div className="stat-row">
                <span className="stat-label">Step Length:</span>
                <div>
                  <span className="stat-value" id="val-step-length">—</span>
                  <span className="stat-unit">m</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-label">Stride Length:</span>
                <div>
                  <span className="stat-value" id="val-stride-length">—</span>
                  <span className="stat-unit">m</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-label">Walking Speed:</span>
                <div>
                  <span className="stat-value" id="val-walking-speed">—</span>
                  <span className="stat-unit">m/s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-lower-row">
          <div className="section-card fade-in-up">
            <div className="section-title">🔄 Gait Phase</div>
            <div className="phase-bar">
              <div className="phase-bar-stance" id="stance-bar" style={{ width: '62%' }}></div>
              <div className="phase-bar-swing" id="swing-bar" style={{ width: '38%' }}></div>
            </div>
            <div className="phase-bar-labels">
              <span className="phase-label stance">
                <span className="phase-dot stance"></span>
                <span id="stance-pct-label">Stance <span id="val-stance-pct">—</span>%</span>
              </span>
              <span className="phase-label swing">
                <span className="phase-dot swing"></span>
                <span id="swing-pct-label">Swing <span id="val-swing-pct">—</span>%</span>
              </span>
            </div>
          </div>

          <div className="section-card fade-in-up">
            <div className="section-title">🔔 Detected Events</div>
            <div className="event-list" id="event-list">
              <span className="text-muted">Waiting for live patient data...</span>
            </div>
          </div>

          <div className="section-card fade-in-up">
            <div className="section-title">📐 Angular Parameters</div>
            <div className="stat-row">
              <span className="stat-label">Peak Shank Angle:</span>
              <div>
                <span className="stat-value" id="val-peak-angle">—</span>
                <span className="stat-unit">°</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

export default DoctorLiveGaitDashboard