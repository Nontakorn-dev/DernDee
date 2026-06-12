# Free Walk AI Coach (Gemini Live Hybrid)

Free Walk uses the shared `GaitProcessor` pipeline and adds a hybrid AI walking coach:

- **Live mode (default):** Gemini Live (`gemini-3.1-flash-live-preview`) speaks Thai coaching cues from gait triggers.
- **Legacy mode:** `GaitFeedbackAdvisor` + Web Speech API (`th-TH`).
- **Hybrid control:** proactive gait coaching + push-to-talk "ask coach".

## Architecture

```
IMU → GaitProcessor → aggregateGaitParams → GaitCoachOrchestrator
  → GeminiLiveClient → Supabase Edge Function (ephemeral token) → Gemini Live
  → PcmAudioPlayer (24 kHz)
```

## Configuration

| Variable | Scope | Description |
|----------|-------|-------------|
| `GEMINI_API_KEY` | Server only | Google AI key for Edge Functions and Vite dev middleware |
| `VITE_FREE_WALK_COACH_MODE` | Client | `live` (default) or `legacy` |

Never put `GEMINI_API_KEY` in a `VITE_*` variable.

## Local development

1. Copy `DernDee_Web-app/.env.example` to `.env` and set `GEMINI_API_KEY`.
2. Run `npm run dev` in `DernDee_Web-app/`.
3. Dev server exposes loopback-only helpers:
   - `POST /__dev/gemini/live-token`
   - `POST /__dev/gemini/coach-summary`

Production uses Supabase Edge Functions:

- `supabase/functions/gemini-live-session`
- `supabase/functions/gemini-coach-summary`

Deploy with `GEMINI_API_KEY` set in Supabase secrets.

## Routes

- `/walk-session` — Free Walk session UI (`FreeWalkSession`)
- `/free-walk` — redirects to `/walk-session`
- `/walk-summary` — session metrics + AI recap

## Session persistence

Walk end stores optional coach metadata in `details`:

- `ai_coach_enabled`
- `coach_mode`
- `coach_summary_text`

## Fallback behaviour

If Live token/connect fails at runtime, the session falls back to legacy coach automatically and continues gait tracking without crashing.

Set `VITE_FREE_WALK_COACH_MODE=legacy` to skip Live entirely.
