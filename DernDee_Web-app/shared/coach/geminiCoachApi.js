import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.js';

const LIVE_COACH_TOKEN_PATH = '/api/live-coach-token';
const WALK_COACH_RECAP_PATH = '/api/walk-coach-recap';
const WALK_COACH_SPEECH_PATH = '/api/walk-coach-speech';

async function waitForAccessToken() {
  if (!isSupabaseConfigured) {
    return null;
  }

  const supabase = getSupabaseClient();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (accessToken) {
      return accessToken;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export function describeCoachConnectError(error) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');

  if (message.includes('Not authenticated')) {
    return 'โค้ชเชื่อมไม่ติด เพราะยังไม่ได้ล็อกอิน';
  }
  if (message.includes('Coach unavailable') || message.includes('503')) {
    return 'โค้ชเชื่อมไม่ติด เพราะ API key';
  }
  if (message.includes('Unauthorized') || message.includes('401')) {
    return 'โค้ชเชื่อมไม่ติด เพราะสิทธิ์ล็อกอิน';
  }
  if (
    message.includes('Failed to fetch')
    || message.includes('Failed to send')
    || message.includes('NetworkError')
  ) {
    return 'โค้ชเชื่อมไม่ติด เพราะเรียกเซิร์ฟเวอร์ไม่ได้';
  }

  return `โค้ชเชื่อมไม่ติด: ${message}`;
}

async function parseCoachResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Coach API failed (${response.status})`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload?.error;
    const message = typeof error === 'string'
      ? error
      : error?.message || payload?.detail || `Coach API failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

async function postCoachFunction(functionName, body = {}, sameOriginPath) {
  const accessToken = await waitForAccessToken();
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const payloadBody = JSON.stringify(body ?? {});
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  if (import.meta.env.PROD && sameOriginPath) {
    const sameOriginResponse = await fetch(sameOriginPath, {
      method: 'POST',
      headers: authHeaders,
      body: payloadBody,
    });
    return parseCoachResponse(sameOriginResponse);
  }

  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase URL is not configured');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      apikey: anonKey,
    },
    body: payloadBody,
  });

  return parseCoachResponse(response);
}

export async function fetchLiveCoachToken() {
  if (import.meta.env.DEV) {
    try {
      const devResponse = await fetch('/__dev/gemini/live-token', { method: 'POST' });
      if (devResponse.ok) {
        return devResponse.json();
      }
    } catch {
      // fall through to Supabase edge function
    }
  }

  return postCoachFunction('gemini-live-session', {}, LIVE_COACH_TOKEN_PATH);
}

export async function fetchCoachSessionRecap(summary, duration) {
  if (import.meta.env.DEV) {
    try {
      const devResponse = await fetch('/__dev/gemini/coach-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, duration }),
      });
      if (devResponse.ok) {
        return devResponse.json();
      }
    } catch {
      // fall through
    }
  }

  return postCoachFunction('gemini-coach-summary', { summary, duration }, WALK_COACH_RECAP_PATH);
}

export async function fetchCoachSpeech(text, options = {}) {
  const payload = {
    text: String(text || '').trim(),
    voiceName: options.voiceName || 'Zubenelgenubi',
  };
  if (!payload.text) {
    throw new Error('Missing speech text');
  }

  if (import.meta.env.DEV) {
    try {
      const devResponse = await fetch('/__dev/gemini/coach-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (devResponse.ok) {
        return parseCoachResponse(devResponse);
      }
    } catch {
      // fall through
    }
  }

  return postCoachFunction('gemini-coach-speech', payload, WALK_COACH_SPEECH_PATH);
}
