import { unlockGameHtmlSfx } from './playGameHtmlSfx.js';

let keepAlive = null;
let createdInGesture = false;

function getAudioContextClass() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.AudioContext || window.webkitAudioContext || null;
}

export function getGameAudioContext(existing) {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) {
    return existing ?? null;
  }

  if (existing && existing.state !== 'closed') {
    return existing;
  }

  return new AudioContextClass();
}

function startKeepAlive(context) {
  if (!context || keepAlive?.context === context) {
    return;
  }
  try {
    keepAlive?.stop?.();
  } catch {
    // already stopped
  }
  try {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = 20;
    gain.gain.value = 0.00001;
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(0);
    keepAlive = osc;
  } catch {
    keepAlive = null;
  }
}

function playSilentTick(context) {
  try {
    const buffer = context.createBuffer(1, 1, context.sampleRate || 44100);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.0001;
    source.connect(gain);
    gain.connect(context.destination);
    source.start(0);
  } catch {
    // WebKit can throw if the context is still closed or interrupted.
  }
}

export function unlockGameAudio(audioContext) {
  unlockGameHtmlSfx();

  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) {
    return audioContext ?? null;
  }

  let context = audioContext && audioContext.state !== 'closed' ? audioContext : null;

  // Safari: a context constructed before the first tap can report "running"
  // after resume() but still output silence. Recreate it inside this gesture.
  if (!createdInGesture && context && context.state !== 'running') {
    try {
      context.close();
    } catch {
      // ignore
    }
    keepAlive = null;
    context = null;
  }

  if (!context) {
    context = new AudioContextClass();
  }

  createdInGesture = true;

  if (context.state !== 'running' && context.resume) {
    const resumeResult = context.resume();
    if (resumeResult?.then) {
      resumeResult.then(() => {
        startKeepAlive(context);
        playSilentTick(context);
      }).catch(() => {});
    }
  }

  startKeepAlive(context);
  playSilentTick(context);

  return context;
}
