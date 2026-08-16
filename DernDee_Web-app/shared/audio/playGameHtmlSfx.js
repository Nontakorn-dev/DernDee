function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function createToneWavUrl(frequency, durationSec, sampleRate = 22050) {
  const sampleCount = Math.max(1, Math.floor(sampleRate * durationSec));
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, time / 0.008) * Math.exp(-time * 10);
    const sample = Math.sin(2 * Math.PI * frequency * time) * envelope;
    view.setInt16(44 + (index * 2), Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

const SFX_URLS = {
  silent: createToneWavUrl(1, 0.05),
  tick: createToneWavUrl(800, 0.1),
  success: createToneWavUrl(784, 0.2),
  landing: createToneWavUrl(587, 0.22),
  complete: createToneWavUrl(659, 0.28),
};

const audioPool = new Map();

function createAudioElement(url) {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.setAttribute('playsinline', 'true');
  audio.setAttribute('webkit-playsinline', 'true');
  return audio;
}

function getPooledAudio(name) {
  if (!audioPool.has(name)) {
    audioPool.set(name, createAudioElement(SFX_URLS[name] || SFX_URLS.success));
  }

  return audioPool.get(name);
}

export function shouldUseHtmlGameSfx() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isBluefy = /Bluefy/i.test(userAgent);
  const isWebKitWithoutChromium = /WebKit/i.test(userAgent)
    && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(userAgent);

  return isIos || isBluefy || isWebKitWithoutChromium;
}

export function unlockGameHtmlSfx() {
  if (typeof Audio === 'undefined') {
    return;
  }

  const silent = getPooledAudio('silent');
  silent.muted = true;
  const playPromise = silent.play();
  if (playPromise?.then) {
    playPromise.then(() => {
      silent.pause();
      silent.currentTime = 0;
    }).catch(() => {});
  }

  ['tick', 'success', 'landing', 'complete'].forEach((name) => {
    getPooledAudio(name).load();
  });
}

export function playGameHtmlSfx(name) {
  if (typeof Audio === 'undefined') {
    return;
  }

  const audio = getPooledAudio(name);
  audio.muted = false;
  audio.volume = name === 'tick' ? 0.55 : 0.8;
  try {
    audio.currentTime = 0;
  } catch {
    // iOS can throw if the element is not ready yet.
  }
  const playPromise = audio.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {});
  }
}
