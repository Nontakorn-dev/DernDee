import { getGameAudioContext } from './unlockGameAudio.js';
import { playGameHtmlSfx, shouldUseHtmlGameSfx } from './playGameHtmlSfx.js';

export function playSteppingStoneLanding(audioContext) {
  if (shouldUseHtmlGameSfx()) {
    playGameHtmlSfx('landing');
    return audioContext;
  }

  const context = audioContext && audioContext.state !== 'closed'
    ? audioContext
    : getGameAudioContext(audioContext);
  if (!context) {
    return audioContext;
  }

  const startTime = context.currentTime;
  const baseOscillator = context.createOscillator();
  const accentOscillator = context.createOscillator();
  const gainNode = context.createGain();

  baseOscillator.connect(gainNode);
  accentOscillator.connect(gainNode);
  gainNode.connect(context.destination);

  baseOscillator.type = 'triangle';
  accentOscillator.type = 'sine';
  baseOscillator.frequency.setValueAtTime(587.33, startTime);
  accentOscillator.frequency.setValueAtTime(880, startTime);

  gainNode.gain.setValueAtTime(0.001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.28, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.22);

  baseOscillator.start(startTime);
  accentOscillator.start(startTime + 0.01);
  baseOscillator.stop(startTime + 0.24);
  accentOscillator.stop(startTime + 0.24);

  return context;
}
