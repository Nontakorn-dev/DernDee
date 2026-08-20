const SCHEDULE_LEAD_SEC = 0.04;

export class PcmAudioPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.audioContext = null;
    this.playing = false;
    this.nextPlayTime = 0;
    this.activeSources = new Set();
    this.onSpeakingChange = null;
    this.onLevelChange = null;
    this.smoothedRms = 0;
    this.speakingIdleTimer = null;
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

  isPlaying() {
    return this.playing || this.activeSources.size > 0;
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

    const rms = this.computeRms(samples);
    this.smoothedRms = this.smoothedRms * 0.62 + rms * 0.38;
    this.onLevelChange?.(this.smoothedRms);

    const buffer = this.audioContext.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    if (this.nextPlayTime < now + SCHEDULE_LEAD_SEC) {
      this.nextPlayTime = now + SCHEDULE_LEAD_SEC;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;

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
      this.smoothedRms = 0;
      this.onSpeakingChange?.(false);
      this.onLevelChange?.(0);
    }, 80);
  }

  stop() {
    if (this.speakingIdleTimer) {
      clearTimeout(this.speakingIdleTimer);
      this.speakingIdleTimer = null;
    }

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
    this.smoothedRms = 0;
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
