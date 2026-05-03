export class GaitFeedbackAdvisor {
  constructor() {
    this.lastFeedbackType = null;
    this.repeatCount = 0;
    this.lastFeedbackAtMs = 0;
    this.consecutiveGoodCycles = 0;
    this.cooldownMs = 4000;
    this.praiseEveryCycles = 6;
  }

  evaluate(params) {
    if (!params?.cycleKey) {
      return null;
    }

    const now = Date.now();
    const canSpeak = now - this.lastFeedbackAtMs >= this.cooldownMs;
    let feedback = null;

    if (Number.isFinite(params.clearance) && params.clearance > 0 && params.clearance < 0.02) {
      feedback = this.#buildFeedback('clearance', 'Watch your step! Lift your knees a bit higher.', canSpeak);
    } else if (Number.isFinite(params.stepLength) && params.stepLength > 0 && params.stepLength < 0.2) {
      feedback = this.#buildFeedback('short_step', 'Steps are too short. Try to take longer strides.', canSpeak);
    } else if (Number.isFinite(params.cadence) && params.cadence > 0 && params.cadence < 60) {
      feedback = this.#buildFeedback('cadence', 'Try a slightly quicker walking rhythm.', canSpeak);
    } else {
      this.consecutiveGoodCycles += 1;
      if (this.consecutiveGoodCycles >= this.praiseEveryCycles) {
        feedback = this.#buildFeedback('praise', 'Great form! Keep it up.', canSpeak);
        this.consecutiveGoodCycles = 0;
      }
    }

    if (!feedback) {
      return null;
    }

    if (feedback.type === this.lastFeedbackType) {
      this.repeatCount += 1;
      if (this.repeatCount >= 3) {
        feedback.should_speak = false;
      }
    } else {
      this.lastFeedbackType = feedback.type;
      this.repeatCount = 0;
    }

    if (feedback.type !== 'praise') {
      this.consecutiveGoodCycles = 0;
    }

    if (feedback.should_speak) {
      this.lastFeedbackAtMs = now;
    }

    return feedback;
  }

  reset() {
    this.lastFeedbackType = null;
    this.repeatCount = 0;
    this.lastFeedbackAtMs = 0;
    this.consecutiveGoodCycles = 0;
  }

  #buildFeedback(type, text, shouldSpeak) {
    return {
      type,
      text,
      voice_text: text,
      should_speak: shouldSpeak,
    };
  }
}