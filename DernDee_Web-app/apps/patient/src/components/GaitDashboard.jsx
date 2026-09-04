import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import stepdeeLogo from '@shared/assets/images/stepdee-logo.png';
import { createGaitLabDashboardApp } from '@shared/gait-dashboard/app.js';
import dashboardCssText from '@shared/gait-dashboard/styles/main.css?inline';

const GaitDashboard = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const styleElement = document.createElement('style');
        styleElement.setAttribute('data-gait-dashboard-ui', 'legacy');
        styleElement.textContent = dashboardCssText;
        document.head.appendChild(styleElement);

        const app = createGaitLabDashboardApp({
            teardownTransportOnDestroy: false,
        });

        app.init();

        return () => {
            app.destroy();
            styleElement.remove();
        };
    }, []);

    return (
        <>
            <div id="loading-overlay" className="loading-overlay">
                <div className="loading-spinner"></div>
                <div className="loading-text">Initializing Gait Dashboard...</div>
            </div>

            <header className="header">
                <div className="header-brand" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <img
                        src={stepdeeLogo}
                        alt="StepDee Logo"
                        style={{ height: '44px', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
                    />
                    <div style={{ height: '32px', width: '2px', background: '#e2e8f0', borderRadius: '4px' }}></div>
                    <div className="header-meta">
                        <div
                            className="header-title"
                            style={{ fontWeight: 800, fontSize: '1.5rem', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}
                        >
                            Dashboard
                        </div>
                        <div className="sensor-side-summary" id="sensor-side-summary">
                            <span className="sensor-summary-empty">Waiting for sensor data</span>
                        </div>
                    </div>
                </div>

                <div className="header-controls">
                    <button className="btn" type="button" onClick={() => navigate('/therapy')}>
                        ← Therapy
                    </button>

                    <div className="connection-status">
                        <div className="status-indicator demo" id="status-indicator"></div>
                        <span id="status-text">Demo Mode</span>
                    </div>

                    <button className="btn" id="mode-toggle" title="Switch between Demo and Browser BLE mode" type="button">
                        <span className="mode-toggle-dot" id="mode-dot"></span>
                        <span id="mode-label">Demo</span>
                    </button>

                    <button className="btn" id="btn-demo" title="Start Demo Mode" type="button">▶ Demo</button>
                    <button className="btn" id="btn-calibrate" title="Calibrate gyro bias and shank length" type="button">🎯 Calibrate</button>
                    <button className="btn btn-primary" id="btn-connect" title="Connect a sensor directly from this browser" type="button">📶 Connect Sensor</button>
                </div>
                <div className="calibration-badge pending" id="calibration-badge">Not calibrated</div>
            </header>

            <div id="calibration-overlay" className="calibration-overlay hidden">
                <div className="calibration-card" id="calibration-panel">
                    <h2>Sensor Calibration</h2>
                    <p className="calibration-lede">Stand still with feet together for 3 seconds. Calibration removes gyro bias for more accurate event detection and step integration.</p>
                    <p className="calibration-blocked hidden" id="calibration-blocked-message"></p>
                    <div className="calibration-form">
                        <label>
                            Height (cm)
                            <input id="calibration-height" type="number" min="120" max="220" step="1" placeholder="170" />
                        </label>
                        <label>
                            Shank length (cm, optional)
                            <input id="calibration-shank" type="number" min="30" max="60" step="0.5" placeholder="auto from height" />
                        </label>
                    </div>
                    <div className="calibration-actions">
                        <button className="btn" id="btn-calibration-cancel" type="button">Cancel</button>
                        <button className="btn btn-primary" id="btn-calibration-start" type="button">Start Calibration</button>
                    </div>
                </div>

                <div className="calibration-card hidden" id="calibration-progress-panel">
                    <h2>Calibrating...</h2>
                    <p className="calibration-lede">Stand still. Keep the shank sensor stable.</p>
                    <div className="calibration-progress-track">
                        <div className="calibration-progress-bar" id="calibration-progress-bar"></div>
                    </div>
                    <p className="calibration-progress-text" id="calibration-progress-text">Collecting samples...</p>
                </div>

                <div className="calibration-card hidden" id="calibration-result-panel">
                    <h2>Calibration Result</h2>
                    <p className="calibration-result-text" id="calibration-result-text"></p>
                    <div className="calibration-actions">
                        <button className="btn btn-primary" id="btn-calibration-done" type="button">Continue</button>
                    </div>
                </div>
            </div>

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
                            <span className="text-muted">Waiting for data...</span>
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
    );
};

export default GaitDashboard;