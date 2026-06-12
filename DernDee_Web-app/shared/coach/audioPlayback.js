export class PcmAudioPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.audioContext = null;
    this.queue = [];
    this.playing = false;
    this.currentSource = null;
    this.onSpeakingChange = null;
  }

  async init() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  setSpeakingListener(listener) {
    this.onSpeakingChange = listener;
  }

  enqueueBase64Pcm(base64) {
    if (!base64) {
      return;
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    const sampleCount = Math.floor(bytes.length / 2);
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) {
      const lo = bytes[i * 2];
      const hi = bytes[i * 2 + 1];
      let int16 = (hi << 8) | lo;
      if (int16 >= 0x8000) {
        int16 -= 0x10000;
      }
      samples[i] = int16 / 32768;
    }

    this.queue.push(samples);
    if (!this.playing) {
      this.playNext();
    }
  }

  playNext() {
    if (!this.queue.length || !this.audioContext) {
      this.playing = false;
      this.onSpeakingChange?.(false);
      return;
    }

    this.playing = true;
    this.onSpeakingChange?.(true);

    const samples = this.queue.shift();
    const buffer = this.audioContext.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    this.currentSource = source;
    source.onended = () => {
      this.currentSource = null;
      this.playNext();
    };
    source.start();
  }

  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // ignore if already stopped
      }
      this.currentSource = null;
    }
    this.queue = [];
    this.playing = false;
    this.onSpeakingChange?.(false);
  }

  destroy() {
    this.stop();
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }
}
