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

async function readFunctionError(error) {
  const fallback = error?.message || 'Coach API failed';
  const response = error?.context;
  if (!response || typeof response.json !== 'function') {
    return fallback;
  }

  try {
    const payload = await response.json();
    return payload?.error || payload?.detail || fallback;
  } catch {
    return fallback;
  }
}

async function invokeCoachFunction(functionName, body = {}) {
  const accessToken = await waitForAccessToken();
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  return data;
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

  return invokeCoachFunction('gemini-live-session');
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

  return invokeCoachFunction('gemini-coach-summary', { summary, duration });
}
