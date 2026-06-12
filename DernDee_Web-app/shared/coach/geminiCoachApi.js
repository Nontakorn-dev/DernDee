import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.js';

function getFunctionsBaseUrl() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return null;
  }
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
}

async function getAccessToken() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

async function postCoachFunction(functionName, body = {}) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const baseUrl = getFunctionsBaseUrl();
  if (!baseUrl) {
    throw new Error('Supabase URL is not configured');
  }

  const response = await fetch(`${baseUrl}/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
