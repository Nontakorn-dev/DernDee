import {
  COACH_ENCOURAGEMENT_CYCLES,
  COACH_PERIODIC_INTERVAL_MS,
  COACH_PROACTIVE_COOLDOWN_MS,
  COACH_THRESHOLDS,
} from './coachConfig.js';
import { buildGaitCoachPrompt, buildGaitCoachSnapshot } from './gaitCoachContext.js';

export class GaitCoachOrchestrator {
  constructor(options = {}) {
    this.lastProactiveAtMs = 0;
    this.lastPeriodicAtMs = 0;
    this.lastProcessedStepCount = 0;
    this.previousStepLengthM = null;
    this.consecutiveGoodCycles = 0;
    this.paused = false;
    this.onDispatch = options.onDispatch ?? null;
  }

  reset() {
    this.lastProactiveAtMs = 0;
    this.lastPeriodicAtMs = 0;
    this.lastProcessedStepCount = 0;
    this.previousStepLengthM = null;
    this.consecutiveGoodCycles = 0;
    this.paused = false;
  }

  setPaused(paused) {
    this.paused = paused;
  }

  evaluate(params, options = {}) {
    if (this.paused || !params) {
      return null;
    }

    const now = Date.now();
    const sessionElapsedS = options.sessionElapsedS ?? 0;
    const stepCount = params.stepCount ?? 0;
    let trigger = null;
    let alert = null;

    if (Number.isFinite(params.clearance) && params.clearance > 0 && params.clearance < COACH_THRESHOLDS.clearanceM) {
      trigger = 'metric_alert';
      alert = 'low_clearance';
    } else if (Number.isFinite(params.stepLength) && params.stepLength > 0 && params.stepLength < COACH_THRESHOLDS.stepLengthM) {
      trigger = 'metric_alert';
      alert = 'short_step';
    } else if (Number.isFinite(params.cadence) && params.cadence > 0 && params.cadence < COACH_THRESHOLDS.cadenceSpm) {
      trigger = 'metric_alert';
      alert = 'slow_cadence';
    } else if (stepCount > this.lastProcessedStepCount) {
      trigger = 'new_step';
      this.lastProcessedStepCount = stepCount;
      this.consecutiveGoodCycles += 1;
    } else if (
      this.consecutiveGoodCycles >= COACH_ENCOURAGEMENT_CYCLES
      && now - this.lastProactiveAtMs >= COACH_PROACTIVE_COOLDOWN_MS
    ) {
      trigger = 'encouragement';
      this.consecutiveGoodCycles = 0;
    } else if (
      sessionElapsedS >= 45
      && now - this.lastPeriodicAtMs >= COACH_PERIODIC_INTERVAL_MS
      && now - this.lastProactiveAtMs >= COACH_PROACTIVE_COOLDOWN_MS
    ) {
      trigger = 'periodic';
      this.lastPeriodicAtMs = now;
    }

    if (!trigger) {
      return null;
    }

    if (now - this.lastProactiveAtMs < COACH_PROACTIVE_COOLDOWN_MS && trigger !== 'user_ask') {
      return null;
    }

    const snapshot = buildGaitCoachSnapshot(params, {
      event: trigger,
      alert,
      sessionElapsedS: sessionElapsedS,
      previousStepLengthM: this.previousStepLengthM,
    });

    if (Number.isFinite(params.stepLength)) {
      this.previousStepLengthM = params.stepLength;
    }

    const prompt = buildGaitCoachPrompt(snapshot);
    this.lastProactiveAtMs = now;

    const dispatch = {
      trigger,
      snapshot,
      prompt,
    };
    this.onDispatch?.(dispatch);
    return dispatch;
  }

  buildUserQuestionDispatch(params, question, sessionElapsedS = 0) {
    const snapshot = buildGaitCoachSnapshot(params, {
      event: 'user_question',
      userQuestion: question,
      sessionElapsedS,
      previousStepLengthM: this.previousStepLengthM,
    });

    return {
      trigger: 'user_ask',
      snapshot,
      prompt: buildGaitCoachPrompt(snapshot),
    };
  }
}
