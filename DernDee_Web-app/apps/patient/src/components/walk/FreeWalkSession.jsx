import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pause } from 'lucide-react';
import { FreeWalkSensorRuntime } from '@shared/gait/freeWalkSensorRuntime.js';
import {
  aggregateGaitParams,
  buildLiveSessionMetricsFromParams,
  buildSessionSummaryFromAnalyzers,
  collectGaitMetricsRowsFromAnalyzers,
} from '@shared/gait/gaitParamsAggregation.js';
import {
  GAIT_ANALYSIS_INTERVAL_MS,
} from '@shared/gait/gaitRuntimeConfig.js';
import { estimateShankLengthM } from '@shared/gait/gaitCalibration.js';
import { createGaitCalibrationCaptureSession } from '@shared/gait/gaitCalibrationCapture.js';
import { readGaitCalibrationPrefs } from '@shared/gait/gaitCalibrationStore.js';
import {
  resolveVisibleShankSensorKeys,
  hasStreamingShankBleDevices,
  hasConnectedShankBleDevices,
} from '@shared/gait/gaitSensorSelection.js';
import { useUserAuth } from '@shared/context/UserAuthContext.jsx';
import {
  TRANSPORT_MODE_WEB_BLUETOOTH,
  createRealtimeConnection,
  getBrowserBleDevicesSnapshot,
  getRealtimeTransportMode,
  subscribeToBrowserBleDevices,
} from '@shared/gateway/realtimeTransport.js';
import { normalizeRealtimeSensorSample } from '@shared/gateway/realtimeSensorUtils.js';
import { persistSessionFromFrontend } from '@shared/services/sessionService.js';
import { COACH_MODES, FREE_WALK_COACH_MODE, getFreeWalkCoachMode, shouldUseBrowserSpeechRecognition } from '@shared/coach/coachConfig.js';
import { describeCoachConnectError, fetchCoachSessionRecap } from '@shared/coach/geminiCoachApi.js';
import { GeminiLiveClient, COACH_CONNECTION_STATES } from '@shared/coach/geminiLiveClient.js';
import { GaitCoachOrchestrator } from '@shared/coach/gaitCoachOrchestrator.js';
import { LegacyWalkCoach } from '@shared/coach/legacyCoach.js';
import { FreeWalkWalkwayTracker } from '@shared/gait/freeWalkWalkway.js';
import { OrientationTracker } from '@shared/sensor/orientationTracker.js';
import stepdeeLogo from '@shared/assets/images/stepdee-logo.png';
import WalkConnectionPills from './WalkConnectionPills.jsx';
import { WalkSessionClock, WalkStepCount } from './WalkSessionHud.jsx';
import WalkAvatarStage from './WalkAvatarStage.jsx';
import WalkPauseDialog from './WalkPauseDialog.jsx';
import WalkMicButton from './WalkMicButton.jsx';
import './FreeWalkSession.css';
import WalkRiverScene from './WalkRiverScene.jsx';
import { AVATAR_CLIPS, resolveAvatarClip } from './avatarClips.js';
import SensorPlacementSheet from '../SensorPlacementSheet.jsx';
import StandStillCalibrateSheet from '../StandStillCalibrateSheet.jsx';
import { SENSOR_PLACEMENT_GUIDES } from '@shared/sensors/sensorPlacementGuides.js';

const TARGET_TIME_SECONDS = 300;
const COACH_CONSENT_KEY = 'derndee_free_walk_ai_consent_v1';
const ASK_HANGOVER_MS = 520;

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const FreeWalkSession = () => {
  const navigate = useNavigate();
  const { user } = useUserAuth();

  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [standStillRunning, setStandStillRunning] = useState(false);
  const [standStillSeconds, setStandStillSeconds] = useState(3);
  const [standStillError, setStandStillError] = useState('');
  const [showPlacement, setShowPlacement] = useState(() => (
    !hasConnectedShankBleDevices(getBrowserBleDevicesSnapshot())
  ));
  const [isConnected, setIsConnected] = useState(false);
  const [sensorStreaming, setSensorStreaming] = useState(false);
  const [sessionMetrics, setSessionMetrics] = useState({});
  const [liveMetrics, setLiveMetrics] = useState({ stepCm: null, cadenceSpm: null, speedMps: null });
  const [coachSubtitle, setCoachSubtitle] = useState('');
  const [coachState, setCoachState] = useState(COACH_CONNECTION_STATES.IDLE);
  const [coachMode, setCoachMode] = useState(getFreeWalkCoachMode());
  const [askCoachActive, setAskCoachActive] = useState(false);
  const [micOpening, setMicOpening] = useState(false);
  const micOpeningRef = useRef(false);
  const [showConsent, setShowConsent] = useState(() => {
    if (typeof window === 'undefined' || getFreeWalkCoachMode() === COACH_MODES.LEGACY) {
      return false;
    }
    return window.localStorage.getItem(COACH_CONSENT_KEY) !== 'true';
  });
  const [showStartTap, setShowStartTap] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    if (getFreeWalkCoachMode() === COACH_MODES.LEGACY) {
      return true;
    }

    return window.localStorage.getItem(COACH_CONSENT_KEY) === 'true';
  });

  const wsRef = useRef(null);
  const analysisTimerRef = useRef(null);
  const sessionStartedRef = useRef(false);
  const sessionStartedAtRef = useRef(null);
  const manualDisconnectRef = useRef(false);
  const sensorRuntimesRef = useRef(new Map());
  const activeSensorKeysRef = useRef([]);
  const latestParamsRef = useRef(null);
  const coachClientRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const coachConnectingRef = useRef(false);
  const orchestratorRef = useRef(null);
  const legacyCoachRef = useRef(null);
  const coachRecapRef = useRef('');
  const sessionElapsedRef = useRef(0);
  const coachModeRef = useRef(coachMode);
  const isActiveRef = useRef(isActive);
  const handleMessageRef = useRef(null);
  const greetingPlayedRef = useRef(false);
  const greetingInFlightRef = useRef(false);
  const audioUnlockedRef = useRef(false);
  const showConsentRef = useRef(showConsent);
  const avatarBusyRef = useRef(false);
  const avatarClipIdRef = useRef('idle');
  const avatarFallbackRef = useRef(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [avatarClipId, setAvatarClipId] = useState('idle');
  const [lipSyncActive, setLipSyncActive] = useState(false);
  const [talking, setTalking] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [endingWalk, setEndingWalk] = useState(false);
  const endingWalkRef = useRef(false);
  const [walkwayView, setWalkwayView] = useState({
    direction: 'out',
    legIndex: 0,
    legSteps: 0,
    progressM: 0,
    lengthM: 5,
  });
  const lipSyncActiveRef = useRef(false);
  const askHangoverRef = useRef(null);
  const questionSentRef = useRef(false);
  const askCoachActiveRef = useRef(false);
  const askReplyWatchRef = useRef(null);
  const lastAskPromptRef = useRef('');
  const lastCoachErrorRef = useRef('');
  const calibrationCaptureRef = useRef(null);
  const isCalibratedRef = useRef(false);
  const tryPlaySessionGreetingRef = useRef(() => false);
  const walkwayRef = useRef(null);
  const walkwayCueQueueRef = useRef([]);
  const walkwayCueDrainingRef = useRef(false);
  const drainWalkwayCuesRef = useRef(() => {});
  const orientationTrackersRef = useRef(new Map());

  if (!walkwayRef.current) {
    walkwayRef.current = new FreeWalkWalkwayTracker();
  }

  const setWalkActive = useCallback((active) => {
    isActiveRef.current = active;
    sensorRuntimesRef.current.forEach((runtime) => runtime.setActive(active));
    orchestratorRef.current?.setPaused(!active);
    if (active) orchestratorRef.current?.markActivity();
    setIsActive(active);
  }, []);

  useEffect(() => {
    showConsentRef.current = showConsent;
  }, [showConsent]);

  if (!orchestratorRef.current) {
    orchestratorRef.current = new GaitCoachOrchestrator();
  }

  const destroySensorRuntime = useCallback((sensorState) => {
    sensorState.destroy();
  }, []);

  const getVisibleSensorStates = useCallback(() => (
    activeSensorKeysRef.current
      .map((sensorKey) => sensorRuntimesRef.current.get(sensorKey))
      .filter(Boolean)
  ), []);

  const getAggregatedLiveParams = useCallback(() => {
    const entries = getVisibleSensorStates()
      .filter((sensorState) => sensorState.latestParams)
      .map((sensorState) => ({ params: sensorState.latestParams }));
    return aggregateGaitParams(entries);
  }, [getVisibleSensorStates]);

  const syncVisibleSensorViews = useCallback(() => {
    activeSensorKeysRef.current = resolveVisibleShankSensorKeys(
      Array.from(sensorRuntimesRef.current.values()),
    );
    return getVisibleSensorStates();
  }, [getVisibleSensorStates]);

  const resetDerivedAnalysis = useCallback(() => {
    sensorRuntimesRef.current.forEach((sensorState) => {
      destroySensorRuntime(sensorState);
    });
    sensorRuntimesRef.current.clear();
    activeSensorKeysRef.current = [];
    orientationTrackersRef.current.clear();
    walkwayRef.current?.reset();
    walkwayCueQueueRef.current = [];
    orchestratorRef.current?.reset();
    legacyCoachRef.current?.reset();
    setSessionMetrics({});
    setLiveMetrics({ stepCm: null, cadenceSpm: null, speedMps: null });
    latestParamsRef.current = null;
    setWalkwayView({
      direction: 'out',
      legIndex: 0,
      legSteps: 0,
      progressM: 0,
      lengthM: 5,
    });
  }, [destroySensorRuntime]);

  const handleAvatarEnded = useCallback((endedClipId) => {
    if (endedClipId === 'greeting') {
      greetingPlayedRef.current = true;
    }

    if (avatarFallbackRef.current) {
      window.clearTimeout(avatarFallbackRef.current);
      avatarFallbackRef.current = null;
    }

    avatarBusyRef.current = false;
    avatarClipIdRef.current = 'idle';
    setAvatarClipId('idle');
    setCoachSubtitle('');
    orchestratorRef.current?.markActivity();
    void drainWalkwayCuesRef.current();
  }, []);

  const beginAskLipSync = useCallback(() => {
    if (askHangoverRef.current) {
      window.clearTimeout(askHangoverRef.current);
      askHangoverRef.current = null;
    }

    if (avatarClipIdRef.current === 'greeting') {
      greetingPlayedRef.current = true;
    }
    // Stop the prerecorded voice before capture/Live playback to avoid overlap.
    if (avatarFallbackRef.current) {
      window.clearTimeout(avatarFallbackRef.current);
      avatarFallbackRef.current = null;
    }
    avatarBusyRef.current = false;
    avatarClipIdRef.current = 'idle';
    setAvatarClipId('idle');

    if (!questionSentRef.current) {
      coachClientRef.current?.disarmOutput?.();
    }

    lipSyncActiveRef.current = true;
    setLipSyncActive(true);
  }, []);

  const endAskLipSync = useCallback((delayMs = ASK_HANGOVER_MS) => {
    if (askHangoverRef.current) {
      window.clearTimeout(askHangoverRef.current);
    }

    askHangoverRef.current = window.setTimeout(() => {
      askHangoverRef.current = null;
      lipSyncActiveRef.current = false;
      setLipSyncActive(false);
      setTalking(false);
      orchestratorRef.current?.markAskRest();
      if (avatarClipIdRef.current === 'idle') {
        setAvatarClipId('idle');
      }
      void drainWalkwayCuesRef.current();
    }, delayMs);
  }, []);

  const playAvatarClip = useCallback((clip) => {
    if (!clip?.id) {
      return false;
    }

    if (lipSyncActiveRef.current) {
      return false;
    }

    if (clip.id === 'greeting' && greetingPlayedRef.current) {
      return false;
    }

    if (avatarBusyRef.current && clip.id !== 'idle') {
      return false;
    }

    if (avatarFallbackRef.current) {
      window.clearTimeout(avatarFallbackRef.current);
      avatarFallbackRef.current = null;
    }

    avatarBusyRef.current = clip.id !== 'idle';
    avatarClipIdRef.current = clip.id;
    setAvatarClipId(clip.id);
    orchestratorRef.current?.markActivity();

    if (clip.id !== 'idle') {
      avatarFallbackRef.current = window.setTimeout(() => {
        if (avatarClipIdRef.current === clip.id) {
          handleAvatarEnded(clip.id);
        }
      }, 12000);
    }

    return true;
  }, [handleAvatarEnded]);

  const waitUntilAvatarIdle = useCallback(async (timeoutMs = 12_000) => {
    const startedAt = Date.now();
    while (avatarBusyRef.current && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, 120);
      });
    }
  }, []);

  const dispatchCoachLine = useCallback(async (dispatch) => {
    if (!dispatch) {
      return false;
    }

    const isWalkwayCue = dispatch.trigger === 'near_end'
      || dispatch.trigger === 'turn_rest'
      || dispatch.trigger === 'walkway_advice';

    if (isWalkwayCue) {
      const walkwayClip = resolveAvatarClip(dispatch);
      if (walkwayClip) {
        return playAvatarClip(walkwayClip);
      }
    }

    const avatarClip = resolveAvatarClip(dispatch);
    if (avatarClip) {
      return playAvatarClip(avatarClip);
    }

    if (dispatch.trigger !== 'user_ask' || !dispatch.prompt) {
      return false;
    }

    if (coachModeRef.current === COACH_MODES.LIVE && coachClientRef.current) {
      questionSentRef.current = true;
      lastAskPromptRef.current = dispatch.prompt;
      beginAskLipSync();
      setCoachSubtitle('กำลังตอบคำถามนะครับ');
      const spoken = await coachClientRef.current.askWithTextAndSpeak(dispatch.prompt, {
        force: true,
        interrupt: true,
      });
      if (!spoken) {
        questionSentRef.current = false;
        coachClientRef.current?.disarmOutput?.();
        setCoachSubtitle('ส่งคำถามไม่สำเร็จ ลองอีกครั้งนะครับ');
        endAskLipSync(180);
        return false;
      }

      clearAskReplyWatch();
      askReplyWatchRef.current = window.setTimeout(() => {
        askReplyWatchRef.current = null;
        if (
          lipSyncActiveRef.current
          && coachClientRef.current?.getState() !== COACH_CONNECTION_STATES.SPEAKING
        ) {
          setCoachSubtitle('ยังไม่ได้ยินคำตอบ ลองถามอีกครั้งนะครับ');
          questionSentRef.current = false;
          endAskLipSync(180);
        }
      }, 12_000);
      return true;
    }

    legacyCoachRef.current?.speakWithWebSpeech(
      dispatch.hintText || dispatch.prompt,
    );
    return true;
  }, [beginAskLipSync, endAskLipSync, playAvatarClip]);

  const playTurnRestThenAdvice = useCallback(async (overlaid, advice) => {
    // Play clip 15 directly so an orchestrator cooldown cannot swallow a real 180° turn.
    const spoken = playAvatarClip(AVATAR_CLIPS.turnRest);
    if (!spoken) {
      return false;
    }
    orchestratorRef.current?.buildWalkwayDispatch(
      'turn_rest',
      overlaid,
      sessionElapsedRef.current,
    );

    await waitUntilAvatarIdle();
    await new Promise((resolve) => {
      window.setTimeout(resolve, 80);
    });

    const adviceDispatch = orchestratorRef.current?.buildWalkwayDispatch(
      'walkway_advice',
      { ...overlaid, walkwayAdvice: advice },
      sessionElapsedRef.current,
    );
    if (adviceDispatch) {
      await dispatchCoachLine(adviceDispatch);
    }
    return true;
  }, [dispatchCoachLine, playAvatarClip, waitUntilAvatarIdle]);

  const drainWalkwayCues = useCallback(async () => {
    if (walkwayCueDrainingRef.current) {
      return;
    }
    walkwayCueDrainingRef.current = true;
    try {
      while (walkwayCueQueueRef.current.length) {
        if (!isActiveRef.current) {
          break;
        }
        if (!greetingPlayedRef.current || lipSyncActiveRef.current) {
          break;
        }
        if (avatarBusyRef.current) {
          await waitUntilAvatarIdle();
          if (avatarBusyRef.current) {
            break;
          }
          continue;
        }

        const cue = walkwayCueQueueRef.current.shift();
        if (!cue) {
          break;
        }
        let played = false;
        if (cue.type === 'turn_rest') {
          played = await playTurnRestThenAdvice(cue.overlaid, cue.advice);
        } else if (cue.type === 'near_end') {
          played = playAvatarClip(AVATAR_CLIPS.nearEnd);
          if (played) {
            orchestratorRef.current?.buildWalkwayDispatch(
              'near_end',
              cue.overlaid,
              sessionElapsedRef.current,
            );
          }
        }
        if (!played) {
          walkwayCueQueueRef.current.unshift(cue);
          break;
        }
      }
    } finally {
      walkwayCueDrainingRef.current = false;
    }
  }, [playAvatarClip, playTurnRestThenAdvice, waitUntilAvatarIdle]);

  drainWalkwayCuesRef.current = drainWalkwayCues;

  const enqueueWalkwayCue = useCallback((cue) => {
    if (!cue?.type || !isActiveRef.current) {
      return;
    }
    const queue = walkwayCueQueueRef.current;
    if (queue.some((item) => item.type === cue.type)) {
      return;
    }
    queue.push(cue);
    void drainWalkwayCues();
  }, [drainWalkwayCues]);

  const tryPlaySessionGreeting = useCallback(() => {
    if (
      greetingPlayedRef.current
      || greetingInFlightRef.current
      || showConsentRef.current
      || !audioUnlockedRef.current
      || !isCalibratedRef.current
    ) {
      return false;
    }

    greetingInFlightRef.current = true;
    const played = playAvatarClip(AVATAR_CLIPS.greeting);
    greetingInFlightRef.current = false;
    return played;
  }, [playAvatarClip]);

  tryPlaySessionGreetingRef.current = tryPlaySessionGreeting;

  const unlockCoachAudio = useCallback(async () => {
    audioUnlockedRef.current = true;
    setAudioUnlocked(true);
    setShowStartTap(false);
    showConsentRef.current = false;
    orchestratorRef.current?.markActivity();
    void coachClientRef.current?.ensureAudioReady?.();
  }, []);

  const applyAggregatedLiveParams = useCallback((aggregatedParams) => {
    if (!aggregatedParams) {
      return;
    }

    const walkway = walkwayRef.current;
    const walkwayResult = walkway?.ingestStep({
      stepCount: aggregatedParams.stepCount,
      stepLength: aggregatedParams.stepLength,
      stepTime: aggregatedParams.stepTime,
    });
    const snap = walkway?.snapshot();
    if (snap) {
      setWalkwayView({
        direction: snap.direction,
        legIndex: snap.legIndex,
        legSteps: snap.legSteps,
        progressM: snap.progressM,
        lengthM: snap.walkwayLengthM,
      });
    }
    const overlaid = walkway?.applySpatialOverlay(aggregatedParams) || aggregatedParams;
    latestParamsRef.current = overlaid;

    const nextSessionMetrics = buildLiveSessionMetricsFromParams(overlaid);
    setSessionMetrics(nextSessionMetrics);
    setLiveMetrics({
      stepCm: Number.isFinite(overlaid.stepLength) ? overlaid.stepLength * 100 : null,
      cadenceSpm: Number.isFinite(overlaid.cadence) ? overlaid.cadence : null,
      speedMps: Number.isFinite(overlaid.walkingSpeed) ? overlaid.walkingSpeed : null,
    });

    const events = walkwayResult?.events || [];
    for (const event of events) {
      if (event?.type === 'near_end') {
        enqueueWalkwayCue({ type: 'near_end', overlaid });
      }
    }
  }, [enqueueWalkwayCue]);

  const initializeCoach = useCallback(async () => {
    if (getFreeWalkCoachMode() === COACH_MODES.LEGACY) {
      legacyCoachRef.current = new LegacyWalkCoach({
        onFeedback: (feedback) => {
          if (feedback?.text) {
            setCoachSubtitle(feedback.text);
          }
          if (feedback?.should_speak) {
            legacyCoachRef.current?.speakWithWebSpeech(feedback.voice_text || feedback.text);
          }
        },
      });
      coachModeRef.current = COACH_MODES.LEGACY;
      setCoachMode(COACH_MODES.LEGACY);
      setCoachState(COACH_CONNECTION_STATES.READY);
      return;
    }

    if (!user?.uid || coachClientRef.current || coachConnectingRef.current) {
      return;
    }

    coachConnectingRef.current = true;
    setCoachState(COACH_CONNECTION_STATES.CONNECTING);

    try {
      const client = new GeminiLiveClient({
        onStateChange: (nextState) => {
          setCoachState(nextState);
          if (nextState === COACH_CONNECTION_STATES.SPEAKING) {
            if (askReplyWatchRef.current) {
              window.clearTimeout(askReplyWatchRef.current);
              askReplyWatchRef.current = null;
            }
            // Audible Live playback is authoritative, including a late reply
            // after the waiting hint timed out.
            questionSentRef.current = true;
            if (!lipSyncActiveRef.current) beginAskLipSync();
            if (askHangoverRef.current) {
              window.clearTimeout(askHangoverRef.current);
              askHangoverRef.current = null;
            }
            setTalking(true);
            return;
          }

          if (nextState === COACH_CONNECTION_STATES.READY && lipSyncActiveRef.current) {
            setTalking(false);
            questionSentRef.current = false;
            endAskLipSync();
          }
        },
        onSubtitleChange: setCoachSubtitle,
        onGreetingRejected: () => {
          if (!coachClientRef.current) {
            return;
          }

          if (askReplyWatchRef.current) {
            window.clearTimeout(askReplyWatchRef.current);
          }
          askReplyWatchRef.current = window.setTimeout(() => {
            askReplyWatchRef.current = null;
            if (
              lipSyncActiveRef.current
              && coachClientRef.current?.getState() !== COACH_CONNECTION_STATES.SPEAKING
            ) {
              setCoachSubtitle('ยังไม่ได้ยินคำตอบ ลองถามอีกครั้งนะครับ');
              questionSentRef.current = false;
              endAskLipSync(180);
            }
          }, 12_000);

          const prompt = lastAskPromptRef.current
            || 'ผู้ป่วยเพิ่งถามมาทางไมค์ ตอบคำถามนั้นทันที ห้ามทักทาย ห้ามสวัสดี ห้ามแนะนำตัว';
          setCoachSubtitle('กำลังตอบคำถามนะครับ');
          void coachClientRef.current.askWithTextAndSpeak(
            `${prompt}\n\nห้ามทักทาย ห้ามสวัสดี ห้ามแนะนำตัว ตอบคำถามทันที`,
            { force: true, interrupt: true, retry: true },
          );
        },
      });
      coachClientRef.current = client;
      await client.connect();
      if (coachClientRef.current !== client) { client.disconnect(); return; }
      coachModeRef.current = COACH_MODES.LIVE;
      setCoachMode(COACH_MODES.LIVE);
      lastCoachErrorRef.current = '';
    } catch (error) {
      console.warn('Live coach unavailable:', error);
      if (speechRecognitionRef.current) {
        const recognition = speechRecognitionRef.current;
        speechRecognitionRef.current = null;
        recognition.onend = recognition.onresult = recognition.onerror = null;
        recognition.abort();
      }
      coachClientRef.current?.disconnect();
      coachClientRef.current = null;
      setCoachState(COACH_CONNECTION_STATES.ERROR);
      lastCoachErrorRef.current = describeCoachConnectError(error);
      setCoachSubtitle(lastCoachErrorRef.current);
    } finally {
      coachConnectingRef.current = false;
    }
  }, [beginAskLipSync, endAskLipSync, user?.uid]);

  const createSensorRuntime = useCallback((sample) => {
    const sensorState = new FreeWalkSensorRuntime(sample, {
      onParams: () => applyAggregatedLiveParams(getAggregatedLiveParams()),
    });
    sensorState.setActive(isActiveRef.current);
    sensorRuntimesRef.current.set(sample.sensorKey, sensorState);
    return sensorState;
  }, [applyAggregatedLiveParams, getAggregatedLiveParams]);

  const handleMessage = useCallback((msg) => {
    if (msg.type !== 'DATA') {
      return;
    }

    const sample = normalizeRealtimeSensorSample(msg.payload || {});
    if (!sample) {
      return;
    }

    calibrationCaptureRef.current?.ingestSample(sample);
    setSensorStreaming(true);

    let sensorState = sensorRuntimesRef.current.get(sample.sensorKey);
    if (!sensorState) {
      sensorState = createSensorRuntime(sample);
    }

    sensorState.side = sample.side || null;
    sensorState.sensorMount = sample.sensorMount || sensorState.sensorMount || 'unknown';
    sensorState.lastSeenAt = Date.now();
    syncVisibleSensorViews();

    if (!activeSensorKeysRef.current.includes(sample.sensorKey)) {
      return;
    }

    const sensorSample = {
      ax: sample.ax,
      ay: sample.ay,
      az: sample.az,
      gx: sample.gx,
      gy: sample.gy,
      gz: sample.gz,
      timestampMs: sample.timestampMs ?? sample.timestamp_ms,
      side: sample.side,
      sensorName: sample.name,
      sensorMount: sensorState.sensorMount,
    };

    sensorState.addSample(sensorSample);

    if (!isActiveRef.current) {
      return;
    }

    let tracker = orientationTrackersRef.current.get(sample.sensorKey);
    if (!tracker) {
      tracker = new OrientationTracker();
      orientationTrackersRef.current.set(sample.sensorKey, tracker);
    }

    const orientation = tracker.update(sensorSample);
    const primaryKey = activeSensorKeysRef.current[0];
    if (primaryKey !== sample.sensorKey || !Number.isFinite(orientation?.yawDeg)) {
      return;
    }

    const turnEvent = walkwayRef.current?.ingestYaw(orientation.yawDeg);
    const snap = walkwayRef.current?.snapshot();
    if (snap && turnEvent?.type === 'turn_rest') {
      setWalkwayView({
        direction: snap.direction,
        legIndex: snap.legIndex,
        legSteps: snap.legSteps,
        progressM: snap.progressM,
        lengthM: snap.walkwayLengthM,
      });
    }
    if (!turnEvent || turnEvent.type !== 'turn_rest') {
      return;
    }

    const overlaid = walkwayRef.current.applySpatialOverlay(latestParamsRef.current || {});
    latestParamsRef.current = overlaid;
    enqueueWalkwayCue({ type: 'turn_rest', overlaid, advice: turnEvent.advice });
  }, [createSensorRuntime, enqueueWalkwayCue, syncVisibleSensorViews]);

  handleMessageRef.current = handleMessage;

  const sendControlMessage = (type, payload = {}) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(JSON.stringify({ type, payload }));
  };

  useEffect(() => {
    void initializeCoach();
    return () => {
      if (askHangoverRef.current) {
        window.clearTimeout(askHangoverRef.current);
      }
      if (askReplyWatchRef.current) {
        window.clearTimeout(askReplyWatchRef.current);
      }
      coachClientRef.current?.disconnect();
      coachClientRef.current = null;
      if (speechRecognitionRef.current) {
        const recognition = speechRecognitionRef.current;
        speechRecognitionRef.current = null;
        recognition.onend = recognition.onresult = recognition.onerror = null;
        recognition.abort();
      }
      if (typeof window !== 'undefined') {
        window.speechSynthesis?.cancel();
      }
    };
  }, [initializeCoach]);

  useEffect(() => {
    manualDisconnectRef.current = false;

    const connectWebSocket = () => {
      const ws = createRealtimeConnection();
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => {
        setIsConnected(false);
        setSensorStreaming(false);
        if (!manualDisconnectRef.current) {
          setTimeout(connectWebSocket, 2000);
        }
      };
      ws.onerror = (error) => console.error('WebSocket Error:', error);
      ws.onmessage = (event) => {
        try {
          handleMessageRef.current?.(JSON.parse(event.data));
        } catch (error) {
          console.error('Parse Error:', error);
        }
      };
    };

    connectWebSocket();

    return () => {
      manualDisconnectRef.current = true;
      wsRef.current?.close();
      resetDerivedAnalysis();
    };
  }, [resetDerivedAnalysis]);

  useEffect(() => {
    analysisTimerRef.current = setInterval(() => {
      sensorRuntimesRef.current.forEach((sensorState) => {
        sensorState.analyze();
      });
    }, GAIT_ANALYSIS_INTERVAL_MS);

    return () => {
      if (analysisTimerRef.current) {
        clearInterval(analysisTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive || !isConnected || !user?.uid || sessionStartedRef.current) {
      return;
    }

    sendControlMessage('START_SESSION', {
      patient_id: user.uid,
      session_type: 'free_walk',
    });
    sessionStartedRef.current = true;
    sessionStartedAtRef.current = new Date().toISOString();
  }, [isActive, isConnected, user?.uid]);

  useEffect(() => {
    coachModeRef.current = coachMode;
  }, [coachMode]);

  useEffect(() => {
    const unsubscribe = subscribeToBrowserBleDevices((nextDevices) => {
      const connected = hasConnectedShankBleDevices(nextDevices);
      setSensorStreaming(hasStreamingShankBleDevices(nextDevices));
      if (!isCalibratedRef.current) {
        setShowPlacement(!connected);
      }
    });
    const snapshot = getBrowserBleDevicesSnapshot();
    setSensorStreaming(hasStreamingShankBleDevices(snapshot));
    setShowPlacement(!hasConnectedShankBleDevices(snapshot));
    return unsubscribe;
  }, []);

  useEffect(() => {
    calibrationCaptureRef.current = createGaitCalibrationCaptureSession({
      onProgress: (percent) => {
        setStandStillSeconds(Math.max(1, Math.ceil((3 * (100 - percent)) / 100)));
      },
      onComplete: (outcome) => {
        setStandStillRunning(false);
        if (!outcome.ok) {
          setStandStillError(outcome.message || 'ยืนนิ่งแล้วลองอีกครั้ง');
          return;
        }

        outcome.results?.forEach((item) => {
          if (!item?.profile?.ok) {
            return;
          }
          const runtime = sensorRuntimesRef.current.get(item.sensorKey);
          runtime?.applyCalibration(item.profile);
        });

        isCalibratedRef.current = true;
        setIsCalibrated(true);
        setStandStillError('');
        setWalkActive(true);
        void tryPlaySessionGreetingRef.current?.();
      },
    });

    return () => {
      calibrationCaptureRef.current?.cancel?.();
    };
  }, [setWalkActive]);

  const startStandStill = useCallback(() => {
    if (calibrationCaptureRef.current?.isActive?.()) {
      return;
    }

    const prefs = readGaitCalibrationPrefs();
    const parsedHeightCm = Number.parseFloat(prefs.heightCm);
    const parsedShankLengthCm = Number.parseFloat(prefs.shankLengthCm);
    setStandStillError('');
    setStandStillRunning(true);
    setStandStillSeconds(3);
    calibrationCaptureRef.current?.start({
      shankLengthM: estimateShankLengthM({
        heightCm: Number.isFinite(parsedHeightCm) ? parsedHeightCm : null,
        shankLengthCm: Number.isFinite(parsedShankLengthCm) ? parsedShankLengthCm : null,
      }),
    });
  }, []);

  useEffect(() => {
    if (showConsent || showStartTap || showPlacement || isCalibrated || standStillRunning || standStillError) {
      return;
    }
    if (!sensorStreaming) {
      return;
    }
    startStandStill();
  }, [
    isCalibrated,
    sensorStreaming,
    showConsent,
    showPlacement,
    showStartTap,
    standStillError,
    standStillRunning,
    startStandStill,
  ]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const interval = setInterval(() => {
      if (!isActiveRef.current) return;
      setTimeElapsed((previous) => {
        const next = previous + 1;
        sessionElapsedRef.current = next;
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    orchestratorRef.current?.setPaused(!isActive);
  }, [isActive]);

  useEffect(() => {
    if (!audioUnlocked || showConsent || !isCalibrated) {
      return undefined;
    }

    void tryPlaySessionGreeting();

    const retryTimer = setTimeout(() => {
      if (!greetingPlayedRef.current) {
        void tryPlaySessionGreeting();
      }
    }, 3000);

    return () => clearTimeout(retryTimer);
  }, [showConsent, audioUnlocked, isCalibrated, tryPlaySessionGreeting]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const idleTimer = setInterval(() => {
      if (
        !greetingPlayedRef.current
        || avatarBusyRef.current
        || lipSyncActiveRef.current
        || askCoachActiveRef.current
      ) {
        return;
      }

      const dispatch = orchestratorRef.current?.evaluateIdle({
        sessionElapsedS: sessionElapsedRef.current,
        params: latestParamsRef.current,
        protocol: FREE_WALK_COACH_MODE,
      });

      if (dispatch) {
        void dispatchCoachLine(dispatch);
      }
    }, 2000);

    return () => clearInterval(idleTimer);
  }, [dispatchCoachLine, isActive]);

  const acceptConsent = async () => {
    window.localStorage.setItem(COACH_CONSENT_KEY, 'true');
    showConsentRef.current = false;
    setShowConsent(false);
    await unlockCoachAudio();
  };

  const clearAskReplyWatch = () => {
    if (askReplyWatchRef.current) {
      window.clearTimeout(askReplyWatchRef.current);
      askReplyWatchRef.current = null;
    }
  };

  const finishAskListen = () => {
    askCoachActiveRef.current = false;
    setAskCoachActive(false);
  };

  const startBrowserAsk = (Recognition) => {
    const recognition = new Recognition();
    let transcript = '';
    let submitted = false;
    let failed = false;
    questionSentRef.current = false;
    askCoachActiveRef.current = true;
    clearAskReplyWatch();
    beginAskLipSync();
    setAskCoachActive(true);
    setCoachSubtitle('พูดได้เลยครับ');
    if ([COACH_CONNECTION_STATES.CLOSED, COACH_CONNECTION_STATES.ERROR].includes(coachClientRef.current?.getState())) {
      coachClientRef.current.disconnect();
      coachClientRef.current = null;
    }
    void initializeCoach();
    void coachClientRef.current?.ensureAudioReady();
    const submit = async () => {
      if (submitted || !transcript.trim() || failed) return;
      submitted = true;
      questionSentRef.current = true;
      setCoachSubtitle('กำลังตอบคำถามนะครับ');
      const client = coachClientRef.current;
      if (!client || !await client.waitUntilReady(8000) || client !== coachClientRef.current) {
        questionSentRef.current = false;
        setCoachSubtitle('โค้ชยังไม่พร้อม ลองถามอีกครั้งครับ');
        endAskLipSync(180);
        return;
      }
      const dispatch = orchestratorRef.current.buildUserQuestionDispatch(
        latestParamsRef.current, transcript, sessionElapsedRef.current,
      );
      await dispatchCoachLine(dispatch);
    };
    recognition.lang = 'th-TH';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const result = event.results?.[event.results.length - 1];
      if (!result?.[0]?.transcript?.trim()) return;
      transcript = result[0].transcript.trim();
      setCoachSubtitle(transcript);
      if (result.isFinal) { recognition.stop(); void submit(); }
    };
    recognition.onerror = (event) => {
      failed = true;
      setCoachSubtitle(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'เบราว์เซอร์ยังไม่อนุญาตการรู้จำเสียง กรุณาตรวจสิทธิ์ไมค์ครับ'
        : 'ยังไม่ได้ยินคำถาม ลองพูดอีกครั้งครับ');
    };
    recognition.onend = () => {
      if (speechRecognitionRef.current !== recognition) return;
      speechRecognitionRef.current = null;
      finishAskListen();
      if (!failed && transcript) void submit();
      else if (!submitted) endAskLipSync(180);
    };
    speechRecognitionRef.current = recognition;
    try { recognition.start(); } catch {
      speechRecognitionRef.current = null;
      finishAskListen();
      setCoachSubtitle('เปิดการรู้จำเสียงไม่สำเร็จ ลองกด Ask อีกครั้งครับ');
      endAskLipSync(180);
    }
  };

  const handleAskCoachStart = async () => {
    if (askCoachActiveRef.current || micOpeningRef.current) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Recognition && shouldUseBrowserSpeechRecognition()) {
      startBrowserAsk(Recognition);
      return;
    }
    micOpeningRef.current = true;
    setMicOpening(true);
    let client;
    try {
      // initializeCoach creates the client synchronously before its first await.
      // Request capture and resume audio within this click, before network waits.
      if ([COACH_CONNECTION_STATES.CLOSED, COACH_CONNECTION_STATES.ERROR].includes(coachClientRef.current?.getState())) {
        coachClientRef.current.disconnect();
        coachClientRef.current = null;
      }
      const connecting = initializeCoach();
      client = coachClientRef.current;
      if (!client) throw new Error(lastCoachErrorRef.current || 'โค้ชยังไม่พร้อม กรุณาเข้าสู่ระบบแล้วลองใหม่ครับ');
      beginAskLipSync();
      const preparing = client.prepareMic();
      void client.ensureAudioReady();
      setCoachSubtitle('กำลังเปิดไมค์ กรุณาอนุญาตการใช้ไมค์ในเบราว์เซอร์');
      const prepared = await preparing;
      await connecting;
      if (!prepared) throw new Error(client.describeMicError());
      if (!await client.waitUntilReady(8000) || client !== coachClientRef.current) {
        throw new Error(lastCoachErrorRef.current || 'เชื่อมต่อโค้ชไม่สำเร็จ ลองใหม่อีกครั้งครับ');
      }
      const started = await client.startPushToTalk();
      if (!started || !client.micActive) throw new Error(client.describeMicError());
      questionSentRef.current = false;
      askCoachActiveRef.current = true;
      clearAskReplyWatch();
      beginAskLipSync();
      setAskCoachActive(true);
      setCoachSubtitle('กำลังฟังครับ แตะ Ask อีกครั้ง หรือปล่อยปุ่มที่กดค้างเมื่อพูดจบ');
    } catch (error) {
      await client?.stopPushToTalk();
      client?.releaseMicStream();
      setCoachSubtitle(error.message || 'เปิดไมค์ไม่สำเร็จ ลองใหม่อีกครั้งครับ');
      endAskLipSync(800);
    } finally {
      micOpeningRef.current = false;
      setMicOpening(false);
    }
  };

  const handleAskCoachEnd = () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      finishAskListen();
      return;
    }
    void (async () => {
      const micWasActive = Boolean(coachClientRef.current?.micActive);
      finishAskListen();

      if (micWasActive && !questionSentRef.current && coachClientRef.current) {
        questionSentRef.current = true;
        clearAskReplyWatch();
        setCoachSubtitle('กำลังตอบคำถามนะครับ');
        askReplyWatchRef.current = window.setTimeout(() => {
          askReplyWatchRef.current = null;
          if (
            lipSyncActiveRef.current
            && coachClientRef.current?.getState() !== COACH_CONNECTION_STATES.SPEAKING
          ) {
            questionSentRef.current = false;
            setCoachSubtitle('ยังไม่ได้ยินคำตอบ ลองถามอีกครั้งนะครับ');
            endAskLipSync(180);
          }
        }, 14_000);

        const spoken = await coachClientRef.current.finishMicAskAndSpeak({
          force: true,
          interrupt: true,
        });
        if (!spoken) {
          questionSentRef.current = false;
          setCoachSubtitle('ยังไม่ได้ยินคำตอบ ลองถามอีกครั้งนะครับ');
          endAskLipSync(180);
        }
        return;
      }

      void coachClientRef.current?.stopPushToTalk();
      if (!questionSentRef.current) {
        endAskLipSync(180);
      }
    })();
  };

  const handlePauseWalk = () => {
    setWalkActive(false);
    setShowPauseDialog(true);
  };

  const handleContinueWalk = () => {
    setShowPauseDialog(false);
    setWalkActive(true);
  };

  const handleEndWalk = async () => {
    if (endingWalkRef.current) {
      return;
    }
    endingWalkRef.current = true;
    setEndingWalk(true);
    setWalkActive(false);
    const endedAt = new Date().toISOString();

    const analyzers = Array.from(sensorRuntimesRef.current.values())
      .map((sensorState) => sensorState.sessionAnalyzer)
      .filter(Boolean);
    const persistedSummary = buildSessionSummaryFromAnalyzers(analyzers);
    const durationLabel = formatTime(timeElapsed);

    const sessionPayload = {
      summary: {
        duration_seconds: timeElapsed,
        total_steps: persistedSummary.total_steps ?? 0,
        avg_speed_mps: persistedSummary.avg_speed_mps ?? 0,
        cadence_spm: persistedSummary.cadence_spm ?? 0,
        avg_step_length_m: persistedSummary.avg_step_length_m ?? 0,
        avg_stride_length_m: persistedSummary.avg_stride_length_m ?? 0,
        avg_clearance_m: persistedSummary.avg_clearance_m ?? 0,
      },
      details: {
        analysis_source: 'shared_gait_processor',
        aggregation_mode: 'gait_dashboard',
        walkway_protocol: FREE_WALK_COACH_MODE,
        walkway_length_m: walkwayRef.current?.lengthM ?? 5,
        spatial_source: latestParamsRef.current?.spatialSource || null,
        ai_coach_enabled: coachMode === COACH_MODES.LIVE,
        coach_mode: coachMode,
        coach_summary_text: null,
      },
      gait_metrics_rows: collectGaitMetricsRowsFromAnalyzers(analyzers),
      source: 'frontend',
    };

    let coachRecapText = coachSubtitle || null;
    if (coachMode === COACH_MODES.LIVE) {
      try {
        const recapPayload = await fetchCoachSessionRecap(sessionPayload.summary, durationLabel);
        coachRecapText = recapPayload?.recapText || coachRecapText;
      } catch (error) {
        console.warn('Coach recap unavailable:', error);
      }
    }

    sessionPayload.details.coach_summary_text = coachRecapText;
    coachRecapRef.current = coachRecapText;

    sendControlMessage('END_SESSION', sessionPayload);

    if (getRealtimeTransportMode() === TRANSPORT_MODE_WEB_BLUETOOTH && user?.uid) {
      void persistSessionFromFrontend({
        patientId: user.uid,
        sessionType: 'free_walk',
        summary: sessionPayload.summary,
        details: sessionPayload.details,
        gaitMetricsRows: sessionPayload.gait_metrics_rows,
        source: sessionPayload.source,
        startedAt: sessionStartedAtRef.current,
        endedAt,
      }).catch((error) => {
        console.error('Failed to persist walk session:', error);
      });
    }

    coachClientRef.current?.disconnect();
    manualDisconnectRef.current = true;
    wsRef.current?.close();

    navigate('/walk-summary', {
      state: {
        duration: durationLabel,
        steps: sessionPayload.summary.total_steps,
        walkingSpeed: sessionPayload.summary.avg_speed_mps,
        cadence: Math.round(sessionPayload.summary.cadence_spm || 0),
        stepLength: sessionPayload.summary.avg_step_length_m,
        strideLength: sessionPayload.summary.avg_stride_length_m,
        clearance: sessionPayload.summary.avg_clearance_m,
        coachRecap: coachRecapText,
        coachMode,
        sessionSummary: sessionPayload.summary,
      },
    });
  };

  const avatarExpanded = lipSyncActive
    || talking
    || askCoachActive
    || avatarClipId !== 'idle'
    || coachState === COACH_CONNECTION_STATES.SPEAKING;

  return (
    <div className="free-walk-session relative flex h-dvh flex-col overflow-hidden">
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 bg-white px-4 py-3 shadow-xl sm:px-6 sm:py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/therapy')}
            className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <img src={stepdeeLogo} alt="StepDee" className="h-10 object-contain sm:h-12" />
        </div>
        <WalkConnectionPills connected={isConnected || sensorStreaming} />
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        {!sensorStreaming ? (
          <div className="shrink-0 px-4 pt-2 sm:px-6 lg:px-8">
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 backdrop-blur-sm sm:text-sm">
              ยังไม่มีข้อมูลจากเซ็นเซอร์ — เชื่อมเซ็นเซอร์ที่ขา (Shank) ก่อนเริ่มเดิน
            </div>
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 px-4 py-2 sm:px-6 lg:px-8 lg:py-4">
            <div className="relative h-full w-full overflow-hidden rounded-[1.75rem]">
              <WalkRiverScene
                progressM={walkwayView.progressM}
                lengthM={walkwayView.lengthM}
                direction={walkwayView.direction}
                dimmed={avatarExpanded}
                paused={!isActive}
                legSteps={walkwayView.legSteps}
              />
              {avatarExpanded ? <div className="walk-scene-frost" aria-hidden="true" /> : null}
              <WalkSessionClock timeElapsed={timeElapsed} />
              <div
                className={
                  avatarExpanded
                    ? 'walk-coach-overlay is-expanded'
                    : 'walk-coach-overlay is-docked'
                }
              >
                <WalkAvatarStage
                  clipId={avatarClipId}
                  paused={!isActive && !talking}
                  isListening={askCoachActive}
                  talking={talking}
                  subtitle=""
                  docked
                  fillFrame
                  onEnded={handleAvatarEnded}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="walk-controls shrink-0">
          <div className="walk-controls__row">
            <button
              type="button"
              onClick={handlePauseWalk}
              className="walk-controls__btn walk-controls__pause"
            >
              <Pause className="h-6 w-6 sm:h-7 sm:w-7" />
              <span>Pause</span>
            </button>
            <WalkMicButton
              active={askCoachActive}
              busy={micOpening}
              onPressStart={handleAskCoachStart}
              onPressEnd={handleAskCoachEnd}
            />
            <WalkStepCount steps={sessionMetrics.total_steps || 0} />
          </div>
        </div>
      </main>

      {!showConsent && !showStartTap && !showPlacement && !isCalibrated ? (
        <StandStillCalibrateSheet
          open
          secondsLeft={sensorStreaming || standStillRunning ? standStillSeconds : null}
          waiting={!sensorStreaming && !standStillError}
          error={standStillError}
          onRetry={startStandStill}
        />
      ) : null}

      <SensorPlacementSheet
        open={showPlacement && !showConsent && !showStartTap}
        title={SENSOR_PLACEMENT_GUIDES.freeWalk.title}
        body={SENSOR_PLACEMENT_GUIDES.freeWalk.body}
        images={SENSOR_PLACEMENT_GUIDES.freeWalk.images}
        onConnect={() => navigate('/device-connection', { state: { returnTo: '/walk-session' } })}
        onClose={() => navigate('/therapy')}
      />

      {showConsent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-extrabold text-gray-800 mb-3">AI Walking Coach</h2>
            <p className="text-sm text-gray-600 mb-4">
              เดินบนลู่ 5 เมตรไป-กลับ และถามโค้ชได้เมื่อต้องการคำแนะนำ
              ข้อมูลจะถูกส่งไปยัง Google Gemini ตามนโยบายความเป็นส่วนตัวของผู้ให้บริการ
            </p>
            <button
              type="button"
              onClick={acceptConsent}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold"
            >
              เข้าใจแล้ว เริ่มเดิน
            </button>
          </div>
        </div>
      )}

      <WalkPauseDialog
        open={showPauseDialog}
        ending={endingWalk}
        onContinue={handleContinueWalk}
        onStop={handleEndWalk}
      />

      {showStartTap && !showConsent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full text-center">
            <h2 className="text-xl font-extrabold text-gray-800 mb-3">พร้อมเริ่มเดิน</h2>
            <p className="text-sm text-gray-600 mb-4">
              แตะปุ่มด้านล่างเพื่อเปิดเสียงโค้ชและเริ่มเซสชัน
            </p>
            <button
              type="button"
              onClick={unlockCoachAudio}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold"
            >
              เริ่มเดิน
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FreeWalkSession;
