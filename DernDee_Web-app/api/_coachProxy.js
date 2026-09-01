const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Cache-Control': 'no-store',
};

function isNodeResponse(res) {
  return Boolean(res && typeof res.status === 'function' && typeof res.json === 'function');
}

function getHeader(req, name) {
  const headers = req?.headers;
  if (!headers) {
    return '';
  }

  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase()) || '';
  }

  return String(headers[name] || headers[name.toLowerCase()] || '');
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

function sendNode(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, apikey');
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json(payload);
}

async function readJsonBody(req) {
  if (typeof req.json === 'function') {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }

  const existing = req.body;
  if (existing && typeof existing === 'object' && (typeof Buffer === 'undefined' || !Buffer.isBuffer(existing))) {
    return existing;
  }

  if (typeof existing === 'string') {
    try {
      return JSON.parse(existing || '{}');
    } catch {
      return {};
    }
  }

  if (typeof req[Symbol.asyncIterator] !== 'function') {
    return {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks.map((chunk) => (
    Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  ))).toString('utf8');

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function proxyCoachRequest(req, res, functionName) {
  const node = isNodeResponse(res);

  try {
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      if (node) {
        sendNode(res, 200, { ok: true });
        return;
      }
      return new Response('ok', { status: 200, headers: CORS_HEADERS });
    }

    if (method !== 'POST') {
      if (node) {
        sendNode(res, 405, { error: 'Method not allowed' });
        return;
      }
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const auth = getHeader(req, 'authorization');
    if (!auth) {
      if (node) {
        sendNode(res, 401, { error: 'Not authenticated' });
        return;
      }
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      if (node) {
        sendNode(res, 500, { error: 'Supabase URL is not configured' });
        return;
      }
      return jsonResponse({ error: 'Supabase URL is not configured' }, 500);
    }

    const body = await readJsonBody(req);
    const upstream = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    });

    const payload = await upstream.json().catch(() => ({}));
    if (node) {
      sendNode(res, upstream.status, payload);
      return;
    }
    return jsonResponse(payload, upstream.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Coach proxy failed';
    if (node) {
      sendNode(res, 500, { error: message });
      return;
    }
    return jsonResponse({ error: message }, 500);
  }
}
