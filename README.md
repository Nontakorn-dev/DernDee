# DernDee

<p align="center">
  <img src="DernDee_Web-app/src/assets/images/derndee-logo.png" width="110" alt="DernDee logo" />
</p>

<h3 align="center">Real-time gait rehabilitation platform with wearable IMUs, therapist-style feedback, and rehab game experiences</h3>

---

## Overview

DernDee is an end-to-end rehabilitation prototype for gait training and real-time movement analysis.
The current architecture uses wearable BLE IMU sensors, Browser BLE transport in the frontend, Supabase for cloud data, and React web apps for patient training and clinician review workflows.

Current repository documentation now lives in `docs/README.md` and the files linked from there.

The current repository centers around three main layers:

- **Wearable firmware** for ESP32 IMU nodes that stream raw motion data over BLE
- **Web application** for authentication, device pairing, calibration, offline-first therapy sessions, rehabilitation games, history screens, and doctor dashboard prototypes
- **Supabase data layer** for auth, profile data, session persistence, and review workflows

The system currently supports these main usage paths:

- **Free Walk therapy** with realtime gait metrics and avatar-style coaching
- **Rehab games** including High Stepper, Magic Plate, and Rhythm Drummer
- **Live gait dashboard** for signal inspection and parameter monitoring

> DernDee is a research and rehabilitation prototype. It is not a certified medical device and should not be used as a substitute for professional clinical judgment.

---

## Key Features

- **Realtime Browser BLE pipeline**
  - Pair multiple IMU sensors directly from the browser
  - Decode Packet V1 raw accel and gyro samples in `realtimeTransport.js`
  - Reuse the same in-browser realtime stream across Calibration, Free Walk, games, and the gait dashboard
  - Queue completed sessions in IndexedDB first, then sync them to Supabase when online

- **Offline-first runtime**
  - Session persistence uses a local outbox in IndexedDB before remote sync
  - Reconnect logic flushes queued sessions automatically from the browser
  - A service worker and web manifest let the patient app install and reopen offline

- **Worker-backed gait analysis**
  - `GaitProcessor` runs in a Web Worker for current Free Walk, Rhythm Drummer, and gait dashboard analysis paths
  - Main-thread UI keeps rendering while sensor analysis continues in the background

- **Patient web application**
  - Supabase authentication and patient profile bootstrapping
  - Device connection and calibration flow before therapy begins
  - Free Walk session summary, history screen, analysis screen, and telemedicine prototype

- **Rehabilitation game modes**
  - **High Stepper** for foot clearance and knee-lift training
  - **Magic Plate** for balance control using quaternion-derived tilt
  - **Rhythm Drummer** for cadence and timing practice against a target beat

- **Live dashboard tools**
  - Secondary gait dashboard entry served by Vite for signal-level monitoring
  - Can reuse the active Browser BLE session from the patient app

- **Doctor workflow prototype**
  - Doctor dashboard, patient detail, review screen, and chat UI
  - History and session review now read directly from Supabase

---

## Workflow

```mermaid
flowchart TD
  A[Power on DernDee IMU nodes] --> B[Pair sensors in Device Connection]
  B --> C[Browser BLE notifications]
  C --> D[Decode Packet V1 in realtimeTransport.js]
  D --> E[Broadcast in-browser DATA payloads]

  E --> F[Calibration]
  E --> G[Free Walk]
  E --> H[High Stepper]
  E --> I[Magic Plate]
  E --> J[Rhythm Drummer]
  E --> K[Gait Dashboard]

  G --> L[persistSessionFromFrontend]
  H --> L
  I --> L
  J --> L

  L --> M[IndexedDB session outbox]
  M --> N{Online?}
  N -->|Yes| O[Sync queued sessions to Supabase]
  N -->|No| P[Keep local queue for retry]

  O --> Q[Supabase sessions]
  O --> R[Supabase gait_metrics]
```

---

## Main Outputs

| Workflow | Input | Output |
| --- | --- | --- |
| Device Connection | Browser BLE pairing | Connected sensor slots and streaming status |
| Calibration | In-browser control flow | Calibration status and readiness gate |
| Free Walk | Raw IMU stream | Step count, cadence, step length, stride length, walking speed, clearance, avatar feedback |
| High Stepper | Raw IMU stream | Rep count, lift height progress, target-based training feedback |
| Magic Plate | Raw IMU stream | Yaw or tilt balance cursor, zone statistics, average deviation |
| Rhythm Drummer | Step timing against BPM target | Score, streak, cadence estimate, timing feedback |
| Gait Dashboard | Raw accel and gyro samples | Live charts, detected gait events, derived gait parameters |

---

## Repository Structure

This tree reflects the current workspace layout. Tool-managed directories such as `.git/`, `.venv/`, `DernDee_Web-app/node_modules/`, and `DernDee_Web-app/dist/` are shown at folder level only.

```text
.
|-- .git/
|-- .gitignore
|-- .venv/
|-- .vscode/
|   |-- mcp.json
|   `-- settings.json
|-- README.md
|-- DernDee_Web-app/
|   |-- .env
|   |-- .env.example
|   |-- .eslintignore
|   |-- .eslintrc.cjs
|   |-- README.md
|   |-- apps/
|   |   |-- clinic/
|   |   |   |-- index.html
|   |   |   `-- src/
|   |   |       |-- components/
|   |   |       |   |-- DoctorAnalysisReview.jsx
|   |   |       |   |-- DoctorChat.jsx
|   |   |       |   |-- DoctorDashboard.jsx
|   |   |       |   `-- DoctorPatientDetail.jsx
|   |   |       |-- data/
|   |   |       |   `-- mockDoctorData.js
|   |   |       `-- main.jsx
|   |   `-- patient/
|   |       |-- index.html
|   |       `-- src/
|   |           |-- components/
|   |           |   |-- AnalysisResult.jsx
|   |           |   |-- Calibration.jsx
|   |           |   |-- DeviceConnection.css
|   |           |   |-- DeviceConnection.jsx
|   |           |   |-- GaitDashboard.jsx
|   |           |   |-- History.jsx
|   |           |   |-- Home.css
|   |           |   |-- Home.jsx
|   |           |   |-- Login.css
|   |           |   |-- Login.jsx
|   |           |   |-- Position.css
|   |           |   |-- Position.jsx
|   |           |   |-- Profile.css
|   |           |   |-- Profile.jsx
|   |           |   |-- Register.css
|   |           |   |-- Register.jsx
|   |           |   |-- Settings.jsx
|   |           |   |-- Telemedicine.jsx
|   |           |   |-- TherapySelect.jsx
|   |           |   |-- WalkSession.jsx
|   |           |   |-- WalkSummary.jsx
|   |           |   `-- games/
|   |           |       |-- GameBalance.jsx
|   |           |       |-- GameClearance.jsx
|   |           |       `-- GameRhythm.jsx
|   |           `-- main.jsx
|   |-- dist/
|   |-- node_modules/
|   |-- package-lock.json
|   |-- package.json
|   |-- postcss.config.js
|   |-- public/
|   |   |-- DernDee_logo.png
|   |   |-- audio/
|   |   |   |-- End.m4a
|   |   |   |-- Fix.m4a
|   |   |   |-- GoodBoy.m4a
|   |   |   `-- Start.m4a
|   |   `-- vite.svg
|   |-- shared/
|   |   |-- assets/
|   |   |   |-- Avatar/
|   |   |   |   |-- Avartar-GoodBoy.gif
|   |   |   |   |-- Avatar-Stop.gif
|   |   |   |   |-- Avatar-Talk.gif
|   |   |   |   |-- General.png
|   |   |   |   |-- Good.png
|   |   |   |   |-- circumduction.mp4
|   |   |   |   |-- circumduction.png
|   |   |   |   |-- clearance.mp4
|   |   |   |   |-- clearance.png
|   |   |   |   |-- short_step.png
|   |   |   |   `-- welcome.png
|   |   |   |-- Voice/
|   |   |   |   |-- End.m4a
|   |   |   |   |-- Fix.m4a
|   |   |   |   |-- GoodBoy.m4a
|   |   |   |   `-- Start.m4a
|   |   |   |-- images/
|   |   |   |   |-- derndee-logo.png
|   |   |   |   |-- devicePositionImage.png
|   |   |   |   |-- doctor.png
|   |   |   |   |-- good-boy.png
|   |   |   |   `-- good.png
|   |   |   `-- react.svg
|   |   |-- auth/
|   |   |   `-- ProtectedRoute.jsx
|   |   |-- context/
|   |   |   `-- UserAuthContext.jsx
|   |   |-- gait/
|   |   |   |-- feedbackAdvisor.js
|   |   |   |-- gaitEventDetector.js
|   |   |   |-- gaitProcessor.js
|   |   |   |-- gatewayLiftEstimator.js
|   |   |   |-- kalmanFilter.js
|   |   |   |-- realtimeStepDetector.js
|   |   |   |-- sessionAnalyzer.js
|   |   |   |-- signalUtils.js
|   |   |   |-- velocityIntegrator.js
|   |   |   `-- verticalLiftEstimator.js
|   |   |-- gait-dashboard/
|   |   |   |-- app.js
|   |   |   |-- data/
|   |   |   |   `-- demoDataGenerator.js
|   |   |   |-- styles/
|   |   |   |   `-- main.css
|   |   |   `-- ui/
|   |   |       |-- charts.js
|   |   |       `-- dashboard.js
|   |   |-- gateway/
|   |   |   `-- realtimeTransport.js
|   |   |-- hooks/
|   |   |   `-- usePersistedGatewaySession.js
|   |   |-- index.css
|   |   |-- sensor/
|   |   |   `-- orientationTracker.js
|   |   |-- services/
|   |   |   |-- profileService.js
|   |   |   `-- sessionService.js
|   |   `-- supabase/
|   |       `-- client.js
|   |-- tailwind.config.js
|   |-- vercel.json
|   `-- vite.config.js
|-- docs/
|   |-- README.md
|   |-- frontend-apps.md
|   |-- realtime-browser-ble.md
|   |-- supabase-cloud-data-layer.md
|   `-- system-overview.md
|-- Hardware/
|   |-- esp32_ICM20948_Ver2.ino
|   |-- esp32_IMU_Ver2.ino
|   `-- esp32_imu_node.ino
`-- supabase/
  `-- migrations/
    |-- 20260430000100_initial_cloud_data_layer.sql
    |-- 20260430000200_enable_doctor_patient_linking.sql
    |-- 20260430000300_add_session_details.sql
    |-- 20260504000100_enable_patient_session_inserts.sql
    `-- 20260504000200_set_session_source_default_to_frontend.sql
```

---

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | React, Vite, React Router, Tailwind CSS, Lucide React, Chart.js |
| Realtime Transport | Browser BLE, sessionStorage-backed transport manager |
| Gait Analytics | Frontend shared gait processing, realtime step detection, orientation tracking |
| Data Layer | Supabase Auth, Postgres, Storage, RLS |
| Firmware | ESP32, Arduino C++, BLE, ICM-20948 style IMU access |

---

## Quick Start

### 1. Clone the repository

```bash
git clone <repository-url>
cd DernDee_Robustness
```

### 2. Start the web application

```bash
cd DernDee_Web-app
npm install
npm run dev
```

The frontend runs at:

- `http://localhost:5174`

### 3. Open the application

- Patient app: `http://localhost:5174`
- Clinic app: `http://localhost:5174/clinic/`
- Gait dashboard: `http://localhost:5174/gait-dashboard`

### 4. Power on compatible IMU nodes

Use `Hardware/esp32_imu_node.ino` and keep BLE device names prefixed with `DernDee`.

### 5. Pair sensors from the browser

1. Open `Device Connection`
2. Click `Connect via BLE` for each required slot
3. Complete calibration and start therapy

---

## Local Development

### Frontend

```bash
cd DernDee_Web-app
npm install
npm run dev
```

Notes:

- Vite is configured to serve on port `5174`
- Supabase is used for auth, profile data, and session history
- Live sensor mode requires a browser that supports Web Bluetooth

### Firmware

Flash the current packet-compatible firmware:

```text
esp32_imu_node.ino
```

Current notes:

- The firmware streams a 22-byte Packet V1 payload with magic, version, sequence, timestamp, raw accel, raw gyro, and CRC8
- `esp32_IMU_Ver2.ino` is an older reference firmware and does not match the current browser decoder format directly

---

## Example User Journey

1. Power on the DernDee IMU nodes.
2. Start the React frontend from `DernDee_Web-app/`.
3. Open the app and sign in.
4. Pair sensors in Device Connection.
5. Complete calibration while standing still.
6. Start a Free Walk session or one of the rehab games.
7. Receive realtime metrics and therapist-style feedback.
8. Review saved sessions from history or clinic screens.

---

## Notes for Development and Deployment

- The active realtime pipeline now lives entirely in the frontend shared modules.
- Session completion is now offline-first: the browser writes to IndexedDB first and flushes to Supabase on reconnect.
- Gait processing and game-specific control logic live primarily in the frontend shared modules.
- Current Free Walk, Rhythm Drummer, and gait dashboard analysis use a worker-backed `GaitProcessor` to reduce UI-thread load.
- Patient history and session persistence center on Supabase.
- Deployment requires browsers and devices that support Web Bluetooth for live sensor mode.
- The frontend now ships with a PWA manifest and service worker for installable offline app shells.

---

## Project Status

Current repo status at a high level:

- Browser BLE realtime transport, frontend gait processing, and game input loops are implemented
- Patient-facing web flows for login, therapy selection, device pairing, calibration, and sessions are available
- Doctor and telemedicine experiences are present as prototypes and still need backend completion
- Older firmware files remain in the repository for reference

---

## License

This repository does not currently include a root license file.
Add an explicit license before public redistribution or open-source release.
