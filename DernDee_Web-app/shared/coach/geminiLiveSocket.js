import { buildCoachLiveSessionConfig } from './coachSystemInstruction.js';

const LIVE_WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService';

function modelPath(model) {
  const name = String(model || '').trim();
  if (!name) {
    return 'models/gemini-3.1-flash-live-preview';
  }
  return name.startsWith('models/') ? name : `models/${name}`;
}

function liveWebsocketUrl(token) {
  const value = String(token || '');
  const ephemeral = value.startsWith('auth_tokens/');
  const method = ephemeral ? 'BidiGenerateContentConstrained' : 'BidiGenerateContent';
  const keyName = ephemeral ? 'access_token' : 'key';
  return `${LIVE_WS_BASE}.${method}?${keyName}=${value}`;
}

function buildSetupMessage(model, config = {}) {
  const systemInstruction = typeof config.systemInstruction === 'string'
    ? { parts: [{ text: config.systemInstruction }] }
    : config.systemInstruction;

  return {
    setup: {
      model: modelPath(model),
      generationConfig: {
        responseModalities: config.responseModalities || ['AUDIO'],
        speechConfig: config.speechConfig,
      },
      systemInstruction,
      outputAudioTranscription: config.outputAudioTranscription || {},
      realtimeInputConfig: config.realtimeInputConfig,
    },
  };
}

async function readSocketText(event) {
  const data = event?.data;
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof Blob) {
    return data.text();
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  return '';
}

export class CoachLiveSession {
  constructor(socket) {
    this.socket = socket;
  }

  sendJson(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(payload));
  }

  sendClientContent({ turns, turnComplete = true }) {
    this.sendJson({
      clientContent: {
        turns,
        turnComplete,
      },
    });
  }

  sendRealtimeInput(params = {}) {
    const realtimeInput = {};
    if (params.audio) {
      realtimeInput.audio = params.audio;
    }
    if (typeof params.text === 'string') {
      realtimeInput.text = params.text;
    }
    if (params.activityStart) {
      realtimeInput.activityStart = params.activityStart;
    }
    if (params.activityEnd) {
      realtimeInput.activityEnd = params.activityEnd;
    }
    this.sendJson({ realtimeInput });
  }

  close() {
    if (!this.socket) {
      return;
    }
    try {
      this.socket.close();
    } catch {
      // already closed
    }
    this.socket = null;
  }
}

export async function connectCoachLiveSession({
  token,
  model,
  config = buildCoachLiveSessionConfig({ responseModalities: ['AUDIO'] }),
  callbacks = {},
} = {}) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('WebSocket is not available');
  }
  if (!token) {
    throw new Error('Missing live coach token');
  }

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(liveWebsocketUrl(token));
    let settled = false;
    let opened = false;
    let timer = 0;

    const finish = (error, session) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        try {
          socket.close();
        } catch {
          // ignore
        }
        reject(error);
        return;
      }
      resolve(session);
    };

    timer = setTimeout(() => {
      finish(new Error('Coach websocket timed out'));
    }, 15_000);

    socket.addEventListener('open', () => {
      try {
        socket.send(JSON.stringify(buildSetupMessage(model, config)));
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Failed to start coach session'));
        return;
      }
      opened = true;
      callbacks.onopen?.();
      finish(null, new CoachLiveSession(socket));
    });

    socket.addEventListener('message', (event) => {
      void readSocketText(event).then((text) => {
        if (!text) {
          return;
        }
        try {
          callbacks.onmessage?.(JSON.parse(text));
        } catch {
          // ignore malformed frames
        }
      });
    });

    socket.addEventListener('error', () => {
      if (opened) {
        callbacks.onerror?.();
        return;
      }
      finish(new Error('Coach websocket failed'));
    });

    socket.addEventListener('close', () => {
      if (opened) {
        callbacks.onclose?.();
        return;
      }
      finish(new Error('Coach websocket closed'));
    });
  });
}
