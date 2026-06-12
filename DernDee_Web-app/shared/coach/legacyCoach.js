import { GaitFeedbackAdvisor } from '../gait/feedbackAdvisor.js';

const LEGACY_VOICE_MESSAGES_TH = {
  clearance: 'ยกเข่าสูงขึ้นอีกนิดนะครับ',
  short_step: 'ลองก้าวให้ยาวขึ้นเล็กน้อย',
  cadence: 'ลองเดินให้จังหวะเร็วขึ้นนิดหนึ่ง',
  praise: 'เดินได้ดีมาก ทำต่อไปนะครับ',
};

export class LegacyWalkCoach {
  constructor(options = {}) {
    this.advisor = new GaitFeedbackAdvisor();
    this.onFeedback = options.onFeedback ?? null;
  }

  reset() {
    this.advisor.reset();
  }

  evaluate(params) {
    const feedback = this.advisor.evaluate(params);
    if (feedback) {
      const thaiVoice = LEGACY_VOICE_MESSAGES_TH[feedback.type] || feedback.voice_text || feedback.text;
      this.onFeedback?.({
        ...feedback,
        text: thaiVoice,
        voice_text: thaiVoice,
      });
    }
    return feedback;
  }

  speakWithWebSpeech(text, options = {}) {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || 'th-TH';
    utterance.rate = options.rate || 0.9;
    if (typeof options.onEnd === 'function') {
      utterance.onend = options.onEnd;
    }
    window.speechSynthesis.speak(utterance);
  }
}
