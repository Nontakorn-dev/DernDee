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

export function unlockGameAudio(audioContext) {
  const context = getGameAudioContext(audioContext);
  if (!context) {
    return null;
  }

  if (context.state !== 'running') {
    const resumeResult = context.resume();
    if (resumeResult?.catch) {
      resumeResult.catch(() => {});
    }
  }

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

  return context;
}
