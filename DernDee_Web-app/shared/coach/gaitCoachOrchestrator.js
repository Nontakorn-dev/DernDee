import {
  COACH_COOLDOWN_BY_TRIGGER_MS,
  COACH_REST_EVERY_STEPS,
  COACH_IDLE_NO_STEP_MS,
  COACH_PERIODIC_INTERVAL_MS,
  COACH_REST_AFTER_PRAISE_MS,
  COACH_REST_AFTER_ASK_MS,
  COACH_STEP_IMPROVE_DELTA_M,
  COACH_THRESHOLDS,
} from './coachConfig.js';
import { COACH_CUES, getAlertCoachCue, getAlertPraiseCue, getWalkwayAdviceCue, pickCueVariant } from './coachPhrases.js';
import {
  buildGaitCoachPrompt,
  buildGaitCoachSnapshot,
  buildGreetingCoachPrompt,
  getCoachHintText,
} from './gaitCoachContext.js';

export class GaitCoachOrchestrator {
  constructor(options = {}) {
    this.lastSpokenByTriggerMs = {};
    this.lastPeriodicAtMs = 0;
    this.lastProcessedStepCount = 0;
    this.lastStepAtMs = Date.now();
    this.previousStepLengthM = null;
    this.consecutiveGoodCycles = 0;
    this.stepsSinceRest = 0;
    this.restClipToggle = 0;
    this.pendingCoaching = null;
    this.restUntilMs = 0;
    this.paused = false;
    this.lastCueVariantIndex = {};
    this.onDispatch = options.onDispatch ?? null;
  }

  reset() {
    this.lastSpokenByTriggerMs = {};
    this.lastPeriodicAtMs = 0;
    this.lastProcessedStepCount = 0;
    this.lastStepAtMs = Date.now();
    this.previousStepLengthM = null;
    this.consecutiveGoodCycles = 0;
    this.stepsSinceRest = 0;
    this.restClipToggle = 0;
    this.pendingCoaching = null;
    this.restUntilMs = 0;
    this.paused = false;
    this.lastCueVariantIndex = {};
  }

  setPaused(paused) {
    this.paused = paused;
  }

  markActivity(now = Date.now()) {
    this.lastStepAtMs = now;
  }

  markAskRest(now = Date.now()) {
    this.restUntilMs = Math.max(this.restUntilMs, now + COACH_REST_AFTER_ASK_MS);
  }

  canSpeak(trigger, now = Date.now()) {
    const cooldown = COACH_COOLDOWN_BY_TRIGGER_MS[trigger] ?? 0;
    const lastSpoken = this.lastSpokenByTriggerMs[trigger] ?? 0;
    return now - lastSpoken >= cooldown;
  }

  markSpoken(trigger, now = Date.now()) {
    this.lastSpokenByTriggerMs[trigger] = now;
  }

  buildDispatch(trigger, params, options = {}) {
    const snapshot = buildGaitCoachSnapshot(params, {
      event: trigger,
      alert: options.alert ?? null,
      sessionElapsedS: options.sessionElapsedS ?? 0,
      previousStepLengthM: this.previousStepLengthM,
      coachingIntent: options.coachingIntent ?? null,
      coachingExample: options.coachingExample ?? null,
      userQuestion: options.userQuestion ?? null,
      restVariant: options.restVariant ?? null,
      cueVariant: options.cueVariant ?? 0,
      walkwayAdvice: options.walkwayAdvice ?? null,
    });

    if (Number.isFinite(params?.stepLength)) {
      this.previousStepLengthM = params.stepLength;
    }

    const dispatch = {
      trigger,
      snapshot,
      prompt: buildGaitCoachPrompt(snapshot),
      hintText: getCoachHintText(snapshot),
    };

    this.onDispatch?.(dispatch);
    return dispatch;
  }

  detectMetricAlert(params) {
    if (Number.isFinite(params.clearance) && params.clearance > 0 && params.clearance < COACH_THRESHOLDS.clearanceM) {
      return 'low_clearance';
    }

    if (Number.isFinite(params.stepLength) && params.stepLength > 0 && params.stepLength < COACH_THRESHOLDS.stepLengthM) {
      return 'short_step';
    }

    if (Number.isFinite(params.cadence) && params.cadence > 0 && params.cadence < COACH_THRESHOLDS.cadenceSpm) {
      return 'slow_cadence';
    }

    return null;
  }

  hasImprovedSinceCoaching(params) {
    if (!this.pendingCoaching || !params) {
      return false;
    }

    const { alert, baseline } = this.pendingCoaching;

    if (alert === 'short_step' && Number.isFinite(params.stepLength)) {
      return params.stepLength >= baseline.stepLengthM + COACH_STEP_IMPROVE_DELTA_M;
    }

    if (alert === 'low_clearance' && Number.isFinite(params.clearance)) {
      return params.clearance >= baseline.clearanceM + 0.01;
    }

    if (alert === 'slow_cadence' && Number.isFinite(params.cadence)) {
      return params.cadence >= baseline.cadenceSpm + 5;
    }

    return false;
  }

  setPendingCoaching(alert, params, stepCount) {
    this.pendingCoaching = {
      alert,
      baseline: {
        stepLengthM: params.stepLength ?? null,
        clearanceM: params.clearance ?? null,
        cadenceSpm: params.cadence ?? null,
      },
      atStepCount: stepCount,
    };
  }

  evaluate(params, options = {}) {
    if (this.paused || !params) {
      return null;
    }

    // Free Walk walkway protocol: no per-step metric/rest coaching.
    if (options.protocol === 'walkway') {
      return null;
    }

    const now = Date.now();
    const sessionElapsedS = options.sessionElapsedS ?? 0;
    const stepCount = params.stepCount ?? 0;
    const hadNewStep = stepCount > this.lastProcessedStepCount;

    if (!hadNewStep) {
      return null;
    }

    this.lastStepAtMs = now;
    this.lastProcessedStepCount = stepCount;
    this.consecutiveGoodCycles += 1;

    if (now < this.restUntilMs) {
      return null;
    }

    this.stepsSinceRest += 1;

    if (this.stepsSinceRest >= COACH_REST_EVERY_STEPS && this.canSpeak('rest_break', now)) {
      this.stepsSinceRest = 0;
      this.restUntilMs = now + COACH_REST_AFTER_PRAISE_MS;
      this.markSpoken('rest_break', now);

      const restVariant = this.restClipToggle === 0 ? 'a' : 'b';
      this.restClipToggle = this.restClipToggle === 0 ? 1 : 0;
      const restCue = restVariant === 'a' ? COACH_CUES.REST_BREAK_A : COACH_CUES.REST_BREAK_B;

      return this.buildDispatch('rest_break', params, {
        sessionElapsedS,
        restVariant,
        coachingIntent: restCue.intent,
        coachingExample: restCue.example,
      });
    }

    if (this.pendingCoaching && this.hasImprovedSinceCoaching(params)) {
      if (!this.canSpeak('step_improved', now)) {
        return null;
      }

      const praiseCue = getAlertPraiseCue(this.pendingCoaching.alert);
      const pendingAlert = this.pendingCoaching.alert;
      this.pendingCoaching = null;
      this.restUntilMs = now + COACH_REST_AFTER_PRAISE_MS;
      this.markSpoken('step_improved', now);

      return this.buildDispatch('step_improved', params, {
        sessionElapsedS,
        alert: pendingAlert,
        coachingIntent: praiseCue?.intent,
        coachingExample: praiseCue?.example,
      });
    }

    const alert = this.detectMetricAlert(params);
    if (alert && this.canSpeak('metric_alert', now)) {
      const coachCue = getAlertCoachCue(alert);
      this.setPendingCoaching(alert, params, stepCount);
      this.markSpoken('metric_alert', now);

      return this.buildDispatch('metric_alert', params, {
        sessionElapsedS,
        alert,
        coachingIntent: coachCue?.intent,
        coachingExample: coachCue?.example,
      });
    }

    if (
      sessionElapsedS >= 60
      && now - this.lastPeriodicAtMs >= COACH_PERIODIC_INTERVAL_MS
      && this.canSpeak('periodic', now)
    ) {
      this.lastPeriodicAtMs = now;
      this.markSpoken('periodic', now);

      return this.buildDispatch('periodic', params, { sessionElapsedS });
    }

    return null;
  }

  evaluateIdle(options = {}) {
    if (this.paused) {
      return null;
    }

    const now = Date.now();
    const sessionElapsedS = options.sessionElapsedS ?? 0;
    const params = options.params ?? null;

    if (now - this.lastStepAtMs < COACH_IDLE_NO_STEP_MS) {
      return null;
    }

    if (!this.canSpeak('idle_resume', now)) {
      return null;
    }

    if (now < this.restUntilMs) {
      return null;
    }

    this.markSpoken('idle_resume', now);
    this.lastStepAtMs = now;

    return this.buildDispatch('idle_resume', params, {
      sessionElapsedS,
      coachingIntent: COACH_CUES.IDLE_RESUME.intent,
      coachingExample: COACH_CUES.IDLE_RESUME.example,
    });
  }

  buildWalkwayDispatch(eventType, params, sessionElapsedS = 0) {
    const now = Date.now();
    if (!this.canSpeak(eventType, now)) {
      return null;
    }

    let cue = COACH_CUES.TURN_REST;
    if (eventType === 'near_end') {
      cue = COACH_CUES.NEAR_END;
    } else if (eventType === 'walkway_advice') {
      cue = getWalkwayAdviceCue(params?.walkwayAdvice || params?.advice);
    }

    const variantKey = eventType === 'walkway_advice'
      ? `walkway_advice:${params?.walkwayAdvice || params?.advice || 'keep'}`
      : eventType;
    const picked = pickCueVariant(cue, this.lastCueVariantIndex[variantKey] ?? -1);
    this.lastCueVariantIndex[variantKey] = picked.index;
    cue = picked.cue;

    this.markSpoken(eventType, now);
    this.markActivity(now);
    if (eventType === 'turn_rest') {
      this.restUntilMs = Math.max(this.restUntilMs, now + COACH_REST_AFTER_PRAISE_MS);
    }

    return this.buildDispatch(eventType, params, {
      sessionElapsedS,
      coachingIntent: cue.intent,
      coachingExample: cue.example,
      cueVariant: picked.index,
      walkwayAdvice: eventType === 'walkway_advice'
        ? (params?.walkwayAdvice || params?.advice || null)
        : null,
    });
  }

  buildGreetingDispatch() {
    return {
      trigger: 'greeting',
      snapshot: { event: 'greeting' },
      prompt: buildGreetingCoachPrompt(),
      hintText: COACH_CUES.GREETING.example,
    };
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
      prompt: buildGaitCoachPrompt(snapshot)
        || `ผู้ป่วยถามว่า: "${question}" ตอบเป็นภาษาไทยสั้น 1 ประโยค ถ้าจำเป็นไม่เกิน 2 ประโยค รวมไม่เกิน 35 คำ ห้ามบรรยายยาว ห้ามเงียบ`,
      hintText: '',
    };
  }
}
