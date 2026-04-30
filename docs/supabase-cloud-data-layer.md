# Supabase Cloud Data Layer

## Goal

Replace the old Firebase-centric data path with Supabase while keeping `gateway_v2` as the single realtime gait ingestion service.

This repo now uses two persistence paths:

- The web apps use `@supabase/supabase-js` with the anon key for auth, profiles, history, doctor dashboard, and review flows.
- `gateway_v2` uses the Supabase service role to persist session summaries and per-step gait metrics after the patient app sends explicit `START_SESSION` and `END_SESSION` messages.

## Project-Specific Architecture

This project cannot persist walking sessions correctly from the frontend alone because raw gait events are produced inside `gateway_v2`. The adapted design is:

1. Patient logs in with Supabase Auth.
2. Patient app opens WebSocket to `gateway_v2`.
3. `WalkSession.jsx` sends `START_SESSION` with `patient_id` and `session_type`.
4. `gateway_v2/main.py` creates an in-memory active session and starts collecting gait metrics.
5. During the walk, the gateway emits live `DATA` payloads to the browser and accumulates metrics server-side.
6. When the walk ends, the patient app sends `END_SESSION` with summary overrides from the current UI state.
7. `gateway_v2/session_persistence.py` writes the final row into `sessions` and all step-level rows into `gait_metrics`.
8. Patient history, latest analysis, doctor dashboard, patient detail, and doctor review pages read from Supabase using RLS-protected queries.

## Delivered In This Repo

- `DernDee_Web-app/shared/supabase/client.js`
- `DernDee_Web-app/shared/services/profileService.js`
- `DernDee_Web-app/shared/services/sessionService.js`
- `DernDee_Web-app/shared/context/UserAuthContext.jsx`
- `DernDee_Web-app/apps/patient/src/components/WalkSession.jsx`
- `gateway_v2/session_persistence.py`
- `supabase/migrations/20260430000100_initial_cloud_data_layer.sql`

## Database Model

The initial migration creates these tables:

- `profiles`: patient/doctor identity and profile metadata.
- `doctor_patient_assignments`: which doctor can view which patient.
- `patient_presence`: online state for dashboard activity.
- `sessions`: one row per completed walking session.
- `gait_metrics`: step-level metrics linked to a session.

It also adds:

- profile bootstrap trigger from `auth.users`
- RLS policies for patient self-access and doctor assigned-patient access
- storage bucket and policies for profile images
- indexes for dashboard/history queries

## Environment Files

Frontend:

- `DernDee_Web-app/.env.example`
- required values: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROFILE_BUCKET`
- recommended for email auth and OAuth: `VITE_SUPABASE_AUTH_REDIRECT_URL`
- optional local-only bypass: `VITE_SUPABASE_SKIP_EMAIL_CONFIRMATION=true` with `SUPABASE_SERVICE_ROLE_KEY` in the same local `.env`

Gateway:

- `gateway_v2/.env.example`
- required values: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Deployment Checklist

1. Apply the SQL migration in Supabase.
2. Copy both `.env.example` files to real `.env` files and fill in project secrets.
3. In Supabase Auth URL configuration, add the same login callback URL you use in `VITE_SUPABASE_AUTH_REDIRECT_URL`.
4. For local development, use a URL that opens on the same machine that clicks the email, or a reachable LAN/public URL instead of `127.0.0.1`.
5. Create or promote doctor users by updating `profiles.role = 'doctor'` in Supabase.
6. Insert `doctor_patient_assignments` rows for each doctor-patient relationship.
7. Start the web app and gateway together so the session write path is complete.

## Notes

- The doctor UI assumes assigned patients already exist in `doctor_patient_assignments`.
- The patient app updates `patient_presence` from the browser heartbeat and marks itself offline on logout/unload.
- Session writes happen in the gateway, not in the browser, so the service role must only be configured inside `gateway_v2`.
- The local signup bypass is implemented in the Vite dev server only and is restricted to loopback requests. It is meant for local development, not public deployment.