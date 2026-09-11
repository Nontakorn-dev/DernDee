import { PcmAudioPlayer } from './audioPlayback.js';
import { LIVE_MODEL } from './coachConfig.js';
import { buildCoachLiveSessionConfig } from './coachSystemInstruction.js';
import { fetchLiveCoachToken } from './geminiCoachApi.js';
import { isCoachGreetingSpeech } from './gaitCoachContext.js';
import { connectCoachLiveSession } from './geminiLiveSocket.js';

export const COACH_CONNECTION_STATES = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  READY: 'ready',
  SPEAKING: 'speaking',
  ERROR: 'error',
  CLOSED: 'closed',
};

export class GeminiLiveClient {
  constructor(options = {}) {
    this.session = null;
    this.audioPlayer = new PcmAudioPlayer(24000);
    this.state = COACH_CONNECTION_STATES.IDLE;
    this.latestSubtitle = '';
    this.muted = false;
    this.onStateChange = options.onStateChange ?? null;
    this.onSubtitleChange = options.onSubtitleChange ?? null;
    this.onGreetingRejected = options.onGreetingRejected ?? null;
    this.responseInProgress = false;
    this.outputArmed = false;
    this.greetingRetryUsed = false;
    this.awaitingNonGreeting = true;
    this.mediaStream = null;
    this.micStreamPromise = null;
    this.micGeneration = 0;
    this.mediaRecorder = null;
    this.micActive = false;
    this.micAudioContext = null;
    this.micProcessor = null;
    this.micSource = null;
    this.micGain = null;
    this.micSink = null;
    this.lastMicError = null;
  }

  getState() {
    return this.state;
  }

  getSubtitle() {
    return this.latestSubtitle;
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) {
      this.audioPlayer.stop();
    }
  }

  setMouthLevelListener(listener) {
    this.audioPlayer.setLevelListener(listener);
  }

  armOutput() {
    this.outputArmed = true;
  }

  disarmOutput() {
    this.responseInProgress = false;
    this.outputArmed = false;
    this.audioPlayer.stop();
  }

  setState(nextState) {
    if (this.state === nextState) {
      return;
    }
    this.state = nextState;
    this.onStateChange?.(nextState);
  }

  async connect() {
    if (this.session) {
      return;
    }

    this.setState(COACH_CONNECTION_STATES.CONNECTING);

    try {
      const tokenPayload = await fetchLiveCoachToken();
      const token = tokenPayload?.token;
      const model = tokenPayload?.model || LIVE_MODEL;

      if (!token) {
        throw new Error('Missing live coach token');
      }

      await this.audioPlayer.init();
      this.audioPlayer.setSpeakingListener((speaking) => this.handlePlaybackSpeaking(speaking));

      this.session = await connectCoachLiveSession({
        token,
        model,
        config: buildCoachLiveSessionConfig({
          responseModalities: ['AUDIO'],
        }),
        callbacks: {
          onopen: () => {
            this.setState(COACH_CONNECTION_STATES.READY);
          },
          onmessage: (message) => {
            this.handleServerMessage(message);
          },
          onerror: () => {
            this.setState(COACH_CONNECTION_STATES.ERROR);
          },
          onclose: () => {
            this.session = null;
            void this.stopPushToTalk();
            this.setState(COACH_CONNECTION_STATES.CLOSED);
          },
        },
      });
    } catch (error) {
      this.setState(COACH_CONNECTION_STATES.ERROR);
      throw error;
    }
  }

  handlePlaybackSpeaking(speaking) {
    if (this.muted || !this.outputArmed) {
      if (!speaking && this.state === COACH_CONNECTION_STATES.SPEAKING) {
        this.setState(COACH_CONNECTION_STATES.READY);
      }
      return;
    }
    // Network chunks can have gaps. Keep the avatar in its speaking clip until
    // the model has finished the turn AND queued audio has drained.
    if (!speaking && this.responseInProgress) return;
    this.setState(speaking ? COACH_CONNECTION_STATES.SPEAKING : COACH_CONNECTION_STATES.READY);
  }

  handleServerMessage(message) {
    const serverContent = message?.serverContent;

    if (serverContent?.interrupted) {
      this.responseInProgress = false;
      this.audioPlayer.stop();
      return;
    }

    const transcription = serverContent?.outputTranscription?.text
      || serverContent?.outputAudioTranscription?.text;

    if (typeof transcription === 'string' && transcription.trim()) {
      this.latestSubtitle = transcription.trim();
      if (this.outputArmed && !this.muted) {
        this.onSubtitleChange?.(this.latestSubtitle);
      }

      if (
        this.outputArmed
        && !this.muted
        && this.awaitingNonGreeting
        && isCoachGreetingSpeech(this.latestSubtitle)
      ) {
        this.audioPlayer.stop();
        if (!this.greetingRetryUsed) {
          this.greetingRetryUsed = true;
          this.onGreetingRejected?.(this.latestSubtitle);
        }
        return;
      }

      if (
        this.outputArmed
        && this.awaitingNonGreeting
        && this.latestSubtitle.replace(/\s+/g, '').length >= 8
        && !isCoachGreetingSpeech(this.latestSubtitle)
      ) {
        this.awaitingNonGreeting = false;
      }
    }

    if (this.muted || !this.outputArmed) {
      return;
    }

    if (typeof message?.data === 'string' && message.data) {
      this.responseInProgress = true;
      this.audioPlayer.enqueueBase64Pcm(message.data);
    }

    serverContent?.modelTurn?.parts?.forEach((part) => {
      if (typeof part?.inlineData?.data === 'string' && part.inlineData.data
        && (!part.inlineData.mimeType || /^audio\/pcm(?:;|$)/i.test(part.inlineData.mimeType))) {
        this.responseInProgress = true;
        this.audioPlayer.enqueueBase64Pcm(part.inlineData.data);
      }
    });
    if (serverContent?.turnComplete) {
      this.responseInProgress = false;
      if (!this.audioPlayer.isPlaying()) this.handlePlaybackSpeaking(false);
    }
  }

  async askWithTextAndSpeak(promptText, options = {}) {
    return this.sendGaitPrompt(promptText, options);
  }

  async finishMicAskAndSpeak() {
    if (!this.micActive || !this.session) return false;
    // activityEnd requests the Live answer; do not wait for a transcript or
    // issue a second TTS request before playing the first audio chunk.
    await this.stopPushToTalk();
    return Boolean(this.session);
  }

  async waitUntilReady(timeoutMs = 12_000) {
    if (this.state === COACH_CONNECTION_STATES.READY) {
      return true;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      if (this.state === COACH_CONNECTION_STATES.READY) {
        return true;
      }

      if (this.state === COACH_CONNECTION_STATES.ERROR || this.state === COACH_CONNECTION_STATES.CLOSED) {
        return false;
      }
    }

    return false;
  }

  async ensureAudioReady() {
    try {
      await this.audioPlayer.init();
      return true;
    } catch {
      return false;
    }
  }

  isBusy() {
    return (
      this.state === COACH_CONNECTION_STATES.SPEAKING
      || this.audioPlayer.isPlaying()
    );
  }

  async waitUntilIdle(timeoutMs = 12_000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (!this.isBusy()) {
        return true;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }

    return !this.isBusy();
  }

  async waitForAudioResponse(timeoutMs = 6000) {
    const startedAt = Date.now();
    const initialSubtitle = this.latestSubtitle;

    while (Date.now() - startedAt < timeoutMs) {
      if (
        this.audioPlayer.isPlaying()
        || this.state === COACH_CONNECTION_STATES.SPEAKING
      ) {
        return true;
      }

      if (this.latestSubtitle && this.latestSubtitle !== initialSubtitle) {
        return true;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }

    return false;
  }

  async sendGaitPrompt(promptText, options = {}) {
    if (!this.session || !promptText) {
      return false;
    }

    try {
      await this.audioPlayer.init();
    } catch {
      return false;
    }

    if (options.interrupt) {
      this.responseInProgress = false;
      this.audioPlayer.stop();
    } else if (this.isBusy()) {
      const idle = await this.waitUntilIdle();
      if (!idle) {
        return false;
      }
    }

    if (!options.force && this.isBusy()) {
      return false;
    }

    const ready = await this.waitUntilReady(4000);
    if (!this.session) {
      return false;
    }
    if (!ready && this.state === COACH_CONNECTION_STATES.ERROR) {
      return false;
    }

    if (!options.retry) {
      this.greetingRetryUsed = false;
    }

    this.armOutput();

    if (typeof this.session.sendClientContent === 'function') {
      this.session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
        turnComplete: true,
      });
      return true;
    }

    this.session.sendRealtimeInput({ text: promptText });
    return true;
  }

  downsampleTo16k(samples, inputRate) {
    if (inputRate === 16000) {
      return samples;
    }

    const ratio = inputRate / 16000;
    const outputLength = Math.max(1, Math.floor(samples.length / ratio));
    const output = new Float32Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const sourceIndex = index * ratio;
      const left = Math.floor(sourceIndex);
      const right = Math.min(left + 1, samples.length - 1);
      const mix = sourceIndex - left;
      output[index] = (samples[left] * (1 - mix)) + (samples[right] * mix);
    }
    return output;
  }

  floatTo16BitPcmBase64(samples) {
    const pcm = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    const bytes = new Uint8Array(pcm.buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  sendPcmChunk(floatSamples, inputRate) {
    if (!this.session || !floatSamples?.length) {
      return;
    }

    const resampled = this.downsampleTo16k(floatSamples, inputRate);
    const base64 = this.floatTo16BitPcmBase64(resampled);
    this.session.sendRealtimeInput({
      audio: {
        data: base64,
        mimeType: 'audio/pcm;rate=16000',
      },
    });
  }

  hasLiveMicStream() {
    return Boolean(this.mediaStream?.getAudioTracks?.().some((track) => track.readyState === 'live'));
  }

  async ensureMicStream() {
    if (this.hasLiveMicStream()) {
      return this.mediaStream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException('Microphone requires HTTPS or localhost', 'SecurityError');
    }
    if (!this.micStreamPromise) {
      const generation = this.micGeneration;
      const pending = navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }).then((stream) => {
        if (generation !== this.micGeneration) {
          stream.getTracks().forEach((track) => track.stop());
          throw new DOMException('Microphone request cancelled', 'AbortError');
        }
        this.mediaStream = stream;
        return stream;
      }).finally(() => {
        if (this.micStreamPromise === pending) this.micStreamPromise = null;
      });
      this.micStreamPromise = pending;
    }
    return this.micStreamPromise;
  }

  async prepareMic() {
    try {
      // Both operations must start in the originating user gesture.
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!this.micAudioContext || this.micAudioContext.state === 'closed') {
        this.micAudioContext = new AudioContextClass();
      }
      const resumed = this.micAudioContext.resume();
      const stream = this.ensureMicStream();
      await Promise.all([resumed, stream]);
      this.lastMicError = null;
      return true;
    } catch (error) {
      this.lastMicError = error;
      return false;
    }
  }

  describeMicError() {
    const name = this.lastMicError?.name || '';
    if (name === 'SecurityError') return 'ไมค์ต้องใช้ผ่าน HTTPS หรือ localhost กรุณาเปิดลิงก์ที่ปลอดภัยครับ';
    if (name === 'AbortError') return 'ยกเลิกการเปิดไมค์แล้ว กดถามเพื่อลองใหม่ครับ';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'เบราว์เซอร์ยังไม่อนุญาตไมค์ กดอนุญาตแล้วถามอีกครั้งนะครับ';
    }
    if (name === 'NotFoundError') {
      return 'ไม่พบไมค์ ตรวจสายหรือเลือกอุปกรณ์เสียงแล้วลองใหม่นะครับ';
    }
    if (name === 'NotReadableError') {
      return 'ไมค์ถูกใช้โดยแอปอื่น ปิดแอปนั้นแล้วลองใหม่นะครับ';
    }
    return 'เปิดไมค์ไม่สำเร็จ อนุญาตไมค์แล้วลองอีกครั้งนะครับ';
  }

  async startPushToTalk() {
    if (!this.session) {
      return false;
    }
    if (this.micActive) {
      return true;
    }

    this.micActive = true;
    this.lastMicError = null;

    try {
      this.session.sendRealtimeInput({ activityStart: {} });
    } catch {
      // session may not support activity signals
    }

    try {
      await this.ensureMicStream();
    } catch (error) {
      this.lastMicError = error;
      this.micActive = false;
      try {
        this.session.sendRealtimeInput({ activityEnd: {} });
      } catch {
        // session may not support activity signals
      }
      return false;
    }

    if (!this.micActive) {
      return false;
    }

    try {
      if (!this.micAudioContext || this.micAudioContext.state === 'closed') {
        this.micAudioContext = new AudioContext();
      }
      if (this.micAudioContext.state === 'suspended') {
        await this.micAudioContext.resume();
      }

      this.micSource = this.micAudioContext.createMediaStreamSource(this.mediaStream);
      this.micProcessor = this.micAudioContext.createScriptProcessor(4096, 1, 1);
      this.micGain = this.micAudioContext.createGain();
      this.micGain.gain.value = 0;

      this.micProcessor.onaudioprocess = (event) => {
        const outputBuffer = event.outputBuffer;
        if (outputBuffer) {
          const channels = outputBuffer.numberOfChannels || 1;
          for (let channel = 0; channel < channels; channel += 1) {
            outputBuffer.getChannelData(channel).fill(0);
          }
        }
        if (!this.micActive || !this.session) {
          return;
        }

        const samples = event.inputBuffer.getChannelData(0);
        this.sendPcmChunk(samples, this.micAudioContext.sampleRate);
      };

      this.micSource.connect(this.micProcessor);
      // Keep the processor in the graph without routing mic audio to speakers.
      // ScriptProcessor copies input to output unless we zero it, and some
      // WebKit builds also ignore a following GainNode of 0.
      if (typeof this.micAudioContext.createMediaStreamDestination === 'function') {
        this.micSink = this.micAudioContext.createMediaStreamDestination();
        this.micProcessor.connect(this.micSink);
      } else {
        this.micProcessor.connect(this.micGain);
        this.micGain.connect(this.micAudioContext.destination);
      }
      return true;
    } catch (error) {
      this.lastMicError = error;
      await this.stopPushToTalk();
      return false;
    }
  }

  async stopPushToTalk() {
    const wasActive = this.micActive;
    this.micActive = false;

    if (this.micProcessor) {
      this.micProcessor.onaudioprocess = null;
      try {
        this.micProcessor.disconnect();
      } catch {
        // already disconnected
      }
      this.micProcessor = null;
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // already disconnected
      }
      this.micSource = null;
    }

    if (this.micGain) {
      try {
        this.micGain.disconnect();
      } catch {
        // already disconnected
      }
      this.micGain = null;
    }

    if (this.micSink) {
      try {
        this.micSink.disconnect?.();
      } catch {
        // already disconnected
      }
      this.micSink = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.releaseMicStream();

    if (wasActive && this.session) {
      this.armOutput();
      try {
        this.session.sendRealtimeInput({ activityEnd: {} });
      } catch {
        // session may not support activity signals
      }
    }
  }

  releaseMicStream() {
    this.micGeneration += 1;
    this.micStreamPromise = null;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  disconnect() {
    this.disarmOutput();
    void this.stopPushToTalk();
    if (this.micAudioContext) {
      void this.micAudioContext.close();
      this.micAudioContext = null;
    }
    this.releaseMicStream();
    this.audioPlayer.destroy();
    this.audioPlayer = new PcmAudioPlayer(24000);
    this.responseInProgress = false;
    this.outputArmed = false;
    this.greetingRetryUsed = false;
    this.awaitingNonGreeting = true;
    try {
      this.session?.close?.();
    } catch {
      // already closed
    }
    this.session = null;
    this.setState(COACH_CONNECTION_STATES.CLOSED);
  }
}
