const SCHEDULE_LEAD_SEC = 0.04;
const SPEECH_WINDOW_SEC = 0.02;
const SPEECH_LOOKAHEAD_SEC = 0.03;

export class PcmAudioPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.audioContext = null;
    this.playing = false;
    this.nextPlayTime = 0;
    this.activeSources = new Set();
    this.onSpeakingChange = null;
    this.onLevelChange = null;
    this.speakingIdleTimer = null;
    this.levelTimeline = [];
    this.onsetTimes = [];
    this.lastSampleRms = 0;
    this.levelRaf = null;
  }

  async init() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  setSpeakingListener(listener) {
    this.onSpeakingChange = listener;
  }

  setLevelListener(listener) {
    this.onLevelChange = listener;
  }

  isPlaying() {
    return this.playing || this.activeSources.size > 0;
  }

  computeRms(samples) {
    if (!samples.length) {
      return 0;
    }

    let sum = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      sum += sample * sample;
    }

    return Math.sqrt(sum / samples.length);
  }

  pushWindowLevels(samples, startTime) {
    const windowSize = Math.max(1, Math.round(this.sampleRate * SPEECH_WINDOW_SEC));
    for (let offset = 0; offset < samples.length; offset += windowSize) {
      const slice = samples.subarray(offset, Math.min(samples.length, offset + windowSize));
      this.levelTimeline.push({
        time: startTime + (offset / this.sampleRate),
        rms: this.computeRms(slice),
      });
    }

    const cutoff = (this.audioContext?.currentTime ?? 0) - 0.8;
    if (this.levelTimeline.length > 8 && this.levelTimeline[0].time < cutoff) {
      this.levelTimeline = this.levelTimeline.filter((event) => event.time >= cutoff);
    }
  }

  interpolateRms(time) {
    const events = this.levelTimeline;
    if (!events.length || time < events[0].time - 0.03 || time > events[events.length - 1].time + 0.08) {
      return 0;
    }

    let low = 0;
    let high = events.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (events[mid].time <= time) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    const current = events[low];
    const next = events[low + 1];
    if (!next) {
      return current.rms;
    }

    const span = next.time - current.time;
    if (span <= 0.0001) {
      return next.rms;
    }

    const mix = (time - current.time) / span;
    return current.rms + ((next.rms - current.rms) * mix);
  }

  sampleSpeechPace(time) {
    const rms = this.interpolateRms(time);
    this.lastSampleRms = rms;
    return Math.max(0, Math.min(1, (rms - 0.012) / 0.065));
  }

  emitPlaybackLevel() {
    if (!this.audioContext) {
      this.onLevelChange?.(0);
      return;
    }

    this.onLevelChange?.(this.sampleSpeechPace(this.audioContext.currentTime + SPEECH_LOOKAHEAD_SEC));
  }

  ensureLevelClock() {
    if (this.levelRaf || typeof window === 'undefined') {
      return;
    }

    const tick = () => {
      if (!this.playing && this.activeSources.size === 0) {
        this.levelRaf = null;
        this.onsetTimes = [];
        this.lastSampleRms = 0;
        this.onLevelChange?.(0);
        return;
      }

      this.levelRaf = window.requestAnimationFrame(tick);
      this.emitPlaybackLevel();
    };

    this.levelRaf = window.requestAnimationFrame(tick);
  }

  stopLevelClock() {
    if (this.levelRaf && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.levelRaf);
    }
    this.levelRaf = null;
  }

  decodeBase64Pcm(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sampleCount = Math.floor(bytes.length / 2);
    const samples = new Float32Array(sampleCount);

    for (let i = 0; i < sampleCount; i += 1) {
      samples[i] = view.getInt16(i * 2, true) / 32768;
    }

    return samples;
  }

  enqueueBase64Pcm(base64) {
    if (!base64 || !this.audioContext) {
      return;
    }

    const samples = this.decodeBase64Pcm(base64);
    if (!samples.length) {
      return;
    }

    const buffer = this.audioContext.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    if (this.nextPlayTime < now + SCHEDULE_LEAD_SEC) {
      this.nextPlayTime = now + SCHEDULE_LEAD_SEC;
    }

    this.pushWindowLevels(samples, this.nextPlayTime);
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
    this.ensureLevelClock();

    this.playing = true;
    this.onSpeakingChange?.(true);
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      this.scheduleSpeakingIdleCheck();
    };
  }

  scheduleSpeakingIdleCheck() {
    if (this.speakingIdleTimer) {
      clearTimeout(this.speakingIdleTimer);
    }

    this.speakingIdleTimer = setTimeout(() => {
      this.speakingIdleTimer = null;
      if (!this.audioContext || this.activeSources.size > 0) {
        return;
      }

      const tailRemaining = this.nextPlayTime - this.audioContext.currentTime;
      if (tailRemaining > 0.08) {
        this.scheduleSpeakingIdleCheck();
        return;
      }

      this.playing = false;
      this.nextPlayTime = 0;
      this.levelTimeline = [];
      this.onsetTimes = [];
      this.lastSampleRms = 0;
      this.stopLevelClock();
      this.onSpeakingChange?.(false);
      this.onLevelChange?.(0);
    }, 80);
  }

  stop() {
    if (this.speakingIdleTimer) {
      clearTimeout(this.speakingIdleTimer);
      this.speakingIdleTimer = null;
    }

    this.stopLevelClock();
    this.levelTimeline = [];
    this.onsetTimes = [];
    this.lastSampleRms = 0;

    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // ignore if already stopped
      }
      try {
        source.disconnect();
      } catch {
        // ignore disconnect errors
      }
    });

    this.activeSources.clear();
    this.nextPlayTime = 0;
    this.playing = false;
    this.onSpeakingChange?.(false);
    this.onLevelChange?.(0);
  }

  destroy() {
    this.stop();
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }
}
