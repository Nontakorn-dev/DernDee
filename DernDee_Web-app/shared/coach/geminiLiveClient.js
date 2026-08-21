import { GoogleGenAI, Modality } from '@google/genai';
import { PcmAudioPlayer } from './audioPlayback.js';
import { LIVE_MODEL } from './coachConfig.js';
import { buildCoachLiveSessionConfig } from './coachSystemInstruction.js';
import { fetchLiveCoachToken } from './geminiCoachApi.js';
import { isCoachGreetingSpeech } from './gaitCoachContext.js';

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
    this.outputArmed = false;
    this.greetingRetryUsed = false;
    this.awaitingNonGreeting = true;
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.micActive = false;
    this.micAudioContext = null;
    this.micProcessor = null;
    this.micSource = null;
    this.micGain = null;
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
    this.outputArmed = false;
    this.audioPlayer.stop();
  }

  setState(nextState) {
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
      this.audioPlayer.setSpeakingListener((speaking) => {
        if (this.muted || !this.outputArmed) {
          if (!speaking && this.state === COACH_CONNECTION_STATES.SPEAKING) {
            this.setState(COACH_CONNECTION_STATES.READY);
          }
          return;
        }
        this.setState(speaking ? COACH_CONNECTION_STATES.SPEAKING : COACH_CONNECTION_STATES.READY);
      });

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

      this.session = await ai.live.connect({
        model,
        config: buildCoachLiveSessionConfig({
          responseModalities: [Modality.AUDIO],
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
            this.setState(COACH_CONNECTION_STATES.CLOSED);
          },
        },
      });
    } catch (error) {
      this.setState(COACH_CONNECTION_STATES.ERROR);
      throw error;
    }
  }

  handleServerMessage(message) {
    const serverContent = message?.serverContent;

    if (serverContent?.interrupted) {
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
      this.audioPlayer.enqueueBase64Pcm(message.data);
      return;
    }

    serverContent?.modelTurn?.parts?.forEach((part) => {
      if (typeof part?.inlineData?.data === 'string' && part.inlineData.data) {
        this.audioPlayer.enqueueBase64Pcm(part.inlineData.data);
      }
    });
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

  async startPushToTalk() {
    if (!this.session || this.micActive) {
      return;
    }

    this.micActive = true;

    try {
      this.session.sendRealtimeInput({ activityStart: {} });
    } catch {
      // session may not support activity signals
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch {
      this.micActive = false;
      try {
        this.session.sendRealtimeInput({ activityEnd: {} });
      } catch {
        // session may not support activity signals
      }
      return;
    }

    try {
      this.micAudioContext = new AudioContext();
      if (this.micAudioContext.state === 'suspended') {
        await this.micAudioContext.resume();
      }

      this.micSource = this.micAudioContext.createMediaStreamSource(this.mediaStream);
      this.micProcessor = this.micAudioContext.createScriptProcessor(4096, 1, 1);
      this.micGain = this.micAudioContext.createGain();
      this.micGain.gain.value = 0;

      this.micProcessor.onaudioprocess = (event) => {
        if (!this.micActive || !this.session) {
          return;
        }

        const samples = event.inputBuffer.getChannelData(0);
        this.sendPcmChunk(samples, this.micAudioContext.sampleRate);
      };

      this.micSource.connect(this.micProcessor);
      this.micProcessor.connect(this.micGain);
      this.micGain.connect(this.micAudioContext.destination);
    } catch {
      this.micActive = false;
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
      }
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

    if (this.micAudioContext) {
      void this.micAudioContext.close();
      this.micAudioContext = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (wasActive && this.session) {
      this.armOutput();
      try {
        this.session.sendRealtimeInput({ activityEnd: {} });
      } catch {
        // session may not support activity signals
      }
    }
  }

  disconnect() {
    this.disarmOutput();
    this.stopPushToTalk();
    this.audioPlayer.destroy();
    this.audioPlayer = new PcmAudioPlayer(24000);
    this.outputArmed = false;
    this.greetingRetryUsed = false;
    this.awaitingNonGreeting = true;
    this.session = null;
    this.setState(COACH_CONNECTION_STATES.CLOSED);
  }
}
