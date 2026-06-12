import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pause, Play, Square } from 'lucide-react';
import { createGaitProcessorClient } from '@shared/gait/gaitProcessorClient.js';
import {
  aggregateGaitParams,
  buildLiveSessionMetricsFromParams,
  buildSessionSummaryFromAnalyzers,
  collectGaitMetricsRowsFromAnalyzers,
} from '@shared/gait/gaitParamsAggregation.js';
import {
  GAIT_ANALYSIS_INTERVAL_MS,
  GAIT_MIN_ANALYSIS_SAMPLES,
} from '@shared/gait/gaitRuntimeConfig.js';
import { GaitSessionAnalyzer } from '@shared/gait/sessionAnalyzer.js';
import { resolveVisibleShankSensorKeys } from '@shared/gait/gaitSensorSelection.js';
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
import { COACH_MODES, getFreeWalkCoachMode } from '@shared/coach/coachConfig.js';
import { fetchCoachSessionRecap } from '@shared/coach/geminiCoachApi.js';
import { GeminiLiveClient, COACH_CONNECTION_STATES } from '@shared/coach/geminiLiveClient.js';
import { GaitCoachOrchestrator } from '@shared/coach/gaitCoachOrchestrator.js';
import { LegacyWalkCoach } from '@shared/coach/legacyCoach.js';
import derndeeLogo from '@shared/assets/images/derndee-logo.png';
import WalkConnectionPills from './WalkConnectionPills.jsx';
import WalkSessionHud from './WalkSessionHud.jsx';
import WalkVoiceOrb from './WalkVoiceOrb.jsx';
import WalkGaitStrip from './WalkGaitStrip.jsx';
import WalkMicButton from './WalkMicButton.jsx';

const TARGET_TIME_SECONDS = 300;
const COACH_CONSENT_KEY = 'derndee_free_walk_ai_consent_v1';

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const FreeWalkSession = () => {
  const navigate = useNavigate();
  const { user } = useUserAuth();

  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [sensorStreaming, setSensorStreaming] = useState(false);
  const [sessionMetrics, setSessionMetrics] = useState({});
  const [liveMetrics, setLiveMetrics] = useState({ stepCm: null, cadenceSpm: null, speedMps: null });
  const [coachSubtitle, setCoachSubtitle] = useState('');
  const [coachState, setCoachState] = useState(COACH_CONNECTION_STATES.IDLE);
  const [coachMode, setCoachMode] = useState(getFreeWalkCoachMode());
  const [askCoachActive, setAskCoachActive] = useState(false);
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
  const orchestratorRef = useRef(null);
  const legacyCoachRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const coachRecapRef = useRef('');
  const sessionElapsedRef = useRef(0);
  const coachModeRef = useRef(coachMode);
  const isActiveRef = useRef(isActive);
  const handleMessageRef = useRef(null);
  const greetingPlayedRef = useRef(false);
  const greetingInFlightRef = useRef(false);
  const greetingAttemptRef = useRef(0);
  const audioUnlockedRef = useRef(false);
  const showConsentRef = useRef(showConsent);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    showConsentRef.current = showConsent;
  }, [showConsent]);

  if (!orchestratorRef.current) {
    orchestratorRef.current = new GaitCoachOrchestrator();
  }

  const destroySensorRuntime = useCallback((sensorState) => {
    sensorState.unsubscribeParams?.();
    sensorState.processor?.destroy?.();
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
    orchestratorRef.current?.reset();
    legacyCoachRef.current?.reset();
    setSessionMetrics({});
    setLiveMetrics({ stepCm: null, cadenceSpm: null, speedMps: null });
    latestParamsRef.current = null;
  }, [destroySensorRuntime]);

  const dispatchCoachLine = useCallback(async (dispatch) => {
    if (!dispatch?.prompt) {
      return false;
    }

    const forceSpeak = [
      'user_ask',
      'greeting',
      'step_improved',
      'idle_resume',
      'metric_alert',
      'encouragement',
    ].includes(dispatch.trigger);

    if (coachModeRef.current === COACH_MODES.LIVE && coachClientRef.current) {
      return coachClientRef.current.sendGaitPrompt(dispatch.prompt, {
        force: forceSpeak,
        interrupt: dispatch.trigger === 'user_ask',
      });
    }

    legacyCoachRef.current?.speakWithWebSpeech(
      dispatch.hintText || dispatch.prompt,
    );
    return true;
  }, []);

  const tryPlaySessionGreeting = useCallback(async () => {
    if (
      greetingPlayedRef.current
      || greetingInFlightRef.current
      || showConsentRef.current
      || !audioUnlockedRef.current
      || greetingAttemptRef.current >= 2
    ) {
      return false;
    }

    const dispatch = orchestratorRef.current?.buildGreetingDispatch();
    if (!dispatch) {
      return false;
    }

    if (coachModeRef.current === COACH_MODES.LIVE) {
      if (!coachClientRef.current) {
        return false;
      }

      const ready = await coachClientRef.current.waitUntilReady();
      if (!ready) {
        return false;
      }

      const audioReady = await coachClientRef.current.ensureAudioReady();
      if (!audioReady) {
        return false;
      }
    }

    greetingInFlightRef.current = true;
    greetingAttemptRef.current += 1;

    try {
      const spoke = await dispatchCoachLine(dispatch);
      if (!spoke) {
        return false;
      }

      greetingPlayedRef.current = true;

      if (coachModeRef.current === COACH_MODES.LIVE && coachClientRef.current) {
        await coachClientRef.current.waitForAudioResponse(6000);
      }

      return true;
    } finally {
      greetingInFlightRef.current = false;
    }
  }, [dispatchCoachLine]);

  const unlockCoachAudio = useCallback(async () => {
    audioUnlockedRef.current = true;
    setAudioUnlocked(true);
    setShowStartTap(false);
    showConsentRef.current = false;

    await coachClientRef.current?.ensureAudioReady?.();
  }, []);

  const applyAggregatedLiveParams = useCallback((aggregatedParams) => {
    if (!aggregatedParams) {
      return;
    }

    latestParamsRef.current = aggregatedParams;
    const nextSessionMetrics = buildLiveSessionMetricsFromParams(aggregatedParams);
    setSessionMetrics(nextSessionMetrics);
    setLiveMetrics({
      stepCm: Number.isFinite(aggregatedParams.stepLength) ? aggregatedParams.stepLength * 100 : null,
      cadenceSpm: Number.isFinite(aggregatedParams.cadence) ? aggregatedParams.cadence : null,
      speedMps: Number.isFinite(aggregatedParams.walkingSpeed) ? aggregatedParams.walkingSpeed : null,
    });

    if (!isActiveRef.current) {
      return;
    }

    const dispatch = orchestratorRef.current?.evaluate(aggregatedParams, {
      sessionElapsedS: sessionElapsedRef.current,
    });

    if (dispatch) {
      void dispatchCoachLine(dispatch);
    }
  }, [dispatchCoachLine]);

  const initializeCoach = useCallback(async () => {
    if (coachMode === COACH_MODES.LEGACY) {
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
      setCoachState(COACH_CONNECTION_STATES.READY);
      return;
    }

    try {
      const client = new GeminiLiveClient({
        onStateChange: setCoachState,
        onSubtitleChange: setCoachSubtitle,
      });
      coachClientRef.current = client;
      await client.connect();
    } catch (error) {
      console.warn('Live coach unavailable, falling back to legacy coach:', error);
      coachClientRef.current?.disconnect();
      coachClientRef.current = null;
      coachModeRef.current = COACH_MODES.LEGACY;
      setCoachMode(COACH_MODES.LEGACY);
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
      setCoachState(COACH_CONNECTION_STATES.READY);
    }
  }, [coachMode]);

  const createSensorRuntime = useCallback((sample) => {
    const processor = createGaitProcessorClient();
    const sessionAnalyzer = new GaitSessionAnalyzer();
    const sensorState = {
      sensorKey: sample.sensorKey,
      side: sample.side || null,
      sensorMount: sample.sensorMount || 'unknown',
      lastSeenAt: Date.now(),
      processor,
      sessionAnalyzer,
      sampleCount: 0,
      latestParams: null,
      unsubscribeParams: null,
    };

    sensorState.unsubscribeParams = processor.onParams(({ params }) => {
      if (!params) {
        return;
      }

      sensorState.latestParams = params;
      sensorState.sessionAnalyzer.record(params);
      applyAggregatedLiveParams(getAggregatedLiveParams());
    });

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

    sensorState.processor.addSample({
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
    });
    sensorState.sampleCount += 1;
  }, [createSensorRuntime, syncVisibleSensorViews]);

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
      coachClientRef.current?.disconnect();
      coachClientRef.current = null;
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
        if (sensorState.sampleCount >= GAIT_MIN_ANALYSIS_SAMPLES) {
          sensorState.processor?.analyze?.();
        }
      });
    }, GAIT_ANALYSIS_INTERVAL_MS);

    return () => {
      if (analysisTimerRef.current) {
        clearInterval(analysisTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isConnected || !user?.uid || sessionStartedRef.current) {
      return;
    }

    sendControlMessage('START_SESSION', {
      patient_id: user.uid,
      session_type: 'free_walk',
    });
    sessionStartedRef.current = true;
    sessionStartedAtRef.current = new Date().toISOString();
  }, [isConnected, user?.uid]);

  useEffect(() => {
    coachModeRef.current = coachMode;
  }, [coachMode]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    const unsubscribe = subscribeToBrowserBleDevices((devices) => {
      const streaming = devices.some((device) => device.status === 'connected' && device.packetCount > 0);
      setSensorStreaming(streaming);
    });
    const snapshot = getBrowserBleDevicesSnapshot();
    setSensorStreaming(snapshot.some((device) => device.status === 'connected' && device.packetCount > 0));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const interval = setInterval(() => {
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
    if (!audioUnlocked || showConsent) {
      return undefined;
    }

    void tryPlaySessionGreeting();

    const retryTimer = setTimeout(() => {
      if (!greetingPlayedRef.current) {
        void tryPlaySessionGreeting();
      }
    }, 3000);

    return () => clearTimeout(retryTimer);
  }, [showConsent, audioUnlocked, tryPlaySessionGreeting]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const idleTimer = setInterval(() => {
      const dispatch = orchestratorRef.current?.evaluateIdle({
        sessionElapsedS: sessionElapsedRef.current,
        params: latestParamsRef.current,
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

  const handleAskCoachStart = () => {
    if (coachMode !== COACH_MODES.LIVE || !coachClientRef.current) {
      setAskCoachActive(true);
      return;
    }

    setAskCoachActive(true);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      void coachClientRef.current.startPushToTalk();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'th-TH';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript || !latestParamsRef.current) {
        return;
      }

      const dispatch = orchestratorRef.current.buildUserQuestionDispatch(
        latestParamsRef.current,
        transcript,
        timeElapsed,
      );
      void dispatchCoachLine(dispatch);
    };
    recognition.onerror = () => {
      setAskCoachActive(false);
    };
    recognition.onend = () => {
      setAskCoachActive(false);
    };
    speechRecognitionRef.current = recognition;
    recognition.start();
  };

  const handleAskCoachEnd = () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    void coachClientRef.current?.stopPushToTalk();
    setAskCoachActive(false);
  };

  const handleEndWalk = async () => {
    setIsActive(false);

    const analyzers = Array.from(sensorRuntimesRef.current.values())
      .map((sensorState) => sensorState.sessionAnalyzer)
      .filter(Boolean);
    const persistedSummary = buildSessionSummaryFromAnalyzers(analyzers);
    const durationLabel = formatTime(timeElapsed);

    const sessionPayload = {
      summary: {
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

  const gaitStepCm = liveMetrics.stepCm ?? (sessionMetrics.avg_step_length_m ? sessionMetrics.avg_step_length_m * 100 : null);
  const gaitCadenceSpm = liveMetrics.cadenceSpm ?? sessionMetrics.cadence_spm;
  const gaitSpeedMps = liveMetrics.speedMps ?? sessionMetrics.avg_speed_mps;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-gradient-to-br from-sky-100 via-blue-200 to-cyan-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/30 blur-3xl sm:h-80 sm:w-80" />
        <div className="absolute -right-16 bottom-24 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl sm:h-96 sm:w-96" />
        <div className="absolute left-1/2 top-1/3 h-56 w-56 -translate-x-1/2 rounded-full bg-blue-300/20 blur-3xl" />
      </div>

      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-white/50 bg-white/70 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/therapy')}
            className="rounded-full p-2 text-slate-600 transition hover:bg-white/80 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <img src={derndeeLogo} alt="DernDee" className="h-9 object-contain sm:h-10" />
        </div>
        <WalkConnectionPills coachState={coachState} coachMode={coachMode} />
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 space-y-3 px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8">
          <WalkSessionHud timeElapsed={timeElapsed} targetSeconds={TARGET_TIME_SECONDS} />

          {!sensorStreaming && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-900 backdrop-blur-sm sm:text-sm">
              ยังไม่มีข้อมูลจากเซ็นเซอร์ — เชื่อมเซ็นเซอร์ที่ขา (Shank) ก่อนเริ่มเดิน
            </div>
          )}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch px-4 py-2 sm:px-6 lg:grid-cols-[minmax(160px,220px)_1fr_minmax(160px,220px)] lg:gap-6 lg:px-8 lg:py-4 xl:grid-cols-[minmax(180px,260px)_1fr_minmax(180px,260px)]">
          <div className="hidden min-h-0 lg:flex lg:flex-col lg:justify-center">
            <WalkGaitStrip
              layout="left"
              stepCm={gaitStepCm}
              cadenceSpm={gaitCadenceSpm}
              speedMps={gaitSpeedMps}
            />
          </div>

          <div className="flex min-h-0 items-center justify-center">
            <WalkVoiceOrb
              isSpeaking={coachState === COACH_CONNECTION_STATES.SPEAKING}
              isListening={askCoachActive}
            />
          </div>

          <div className="hidden min-h-0 lg:flex lg:flex-col lg:justify-center">
            <WalkGaitStrip
              layout="right"
              stepCm={gaitStepCm}
              cadenceSpm={gaitCadenceSpm}
              speedMps={gaitSpeedMps}
            />
          </div>
        </div>

        <div className="shrink-0 px-4 pb-2 pt-1 sm:px-6 lg:hidden">
          <WalkGaitStrip
            stepCm={gaitStepCm}
            cadenceSpm={gaitCadenceSpm}
            speedMps={gaitSpeedMps}
          />
        </div>

        <div className="shrink-0 border-t border-white/50 bg-white/55 px-4 py-4 backdrop-blur-xl sm:px-6 sm:py-5 lg:px-8">
          <div className="mx-auto grid max-w-5xl grid-cols-3 gap-2 sm:gap-4">
            <WalkMicButton
              active={askCoachActive}
              disabled={coachState === COACH_CONNECTION_STATES.ERROR || coachState === COACH_CONNECTION_STATES.CONNECTING}
              onPressStart={handleAskCoachStart}
              onPressEnd={handleAskCoachEnd}
            />
            <button
              type="button"
              onClick={() => setIsActive((previous) => !previous)}
              className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-amber-300/80 bg-gradient-to-b from-amber-300 to-amber-500 font-bold text-white shadow-lg shadow-amber-500/25 transition active:scale-[0.97] sm:min-h-[5rem] sm:rounded-3xl"
            >
              {isActive ? <Pause className="h-6 w-6 sm:h-7 sm:w-7" /> : <Play className="h-6 w-6 sm:h-7 sm:w-7" />}
              <span className="text-xs font-extrabold uppercase tracking-wide sm:text-sm">
                {isActive ? 'Pause' : 'Resume'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleEndWalk}
              className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-red-400/80 bg-gradient-to-b from-red-500 to-red-600 font-bold text-white shadow-lg shadow-red-500/25 transition active:scale-[0.97] sm:min-h-[5rem] sm:rounded-3xl"
            >
              <Square className="h-6 w-6 sm:h-7 sm:w-7" />
              <span className="text-xs font-extrabold uppercase tracking-wide sm:text-sm">End</span>
            </button>
          </div>
        </div>
      </main>

      {showConsent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-extrabold text-gray-800 mb-3">AI Walking Coach</h2>
            <p className="text-sm text-gray-600 mb-4">
              โค้ช AI จะใช้ค่า gait parameters (เช่น ระยะก้าว, cadence) เพื่อให้คำแนะนำผ่านเสียง
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
