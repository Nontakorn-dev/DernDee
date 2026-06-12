import { GoogleGenAI, Modality } from '@google/genai';
import { PcmAudioPlayer } from './audioPlayback.js';
import { LIVE_MODEL } from './coachConfig.js';
import { fetchLiveCoachToken } from './geminiCoachApi.js';

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
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.micActive = false;
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
        if (this.muted) {
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
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
        },
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
      this.onSubtitleChange?.(this.latestSubtitle);
    }

    if (this.muted) {
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

    if (!options.force && this.state === COACH_CONNECTION_STATES.SPEAKING) {
      return false;
    }

    if (options.force) {
      this.audioPlayer.stop();
    }

    this.session.sendRealtimeInput({ text: promptText });
    return true;
  }

  async startPushToTalk() {
    if (!this.session || this.micActive) {
      return;
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
      },
    });

    this.micActive = true;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
    this.mediaRecorder.ondataavailable = async (event) => {
      if (!event.data?.size || !this.session) {
        return;
      }

      const buffer = await event.data.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      this.session.sendRealtimeInput({
        audio: {
          data: base64,
          mimeType,
        },
      });
    };

    this.mediaRecorder.start(250);
  }

  async stopPushToTalk() {
    this.micActive = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.session) {
      this.session.sendRealtimeInput({ audioStreamEnd: true });
    }
  }

  disconnect() {
    this.stopPushToTalk();
    this.audioPlayer.destroy();
    this.audioPlayer = new PcmAudioPlayer(24000);
    this.session = null;
    this.setState(COACH_CONNECTION_STATES.CLOSED);
  }
}
