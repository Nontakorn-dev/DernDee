import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.js';

async function waitForAccessToken() {
  if (!isSupabaseConfigured()) {
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

async function postCoachFunction(functionName, body = {}) {
  const accessToken = await waitForAccessToken();
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase URL is not configured');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.detail || `Coach API failed (${response.status})`);
  }

  return payload;
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

  return postCoachFunction('gemini-live-session');
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

  return postCoachFunction('gemini-coach-summary', { summary, duration });
}
