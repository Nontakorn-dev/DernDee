import { generateWalkingData, streamDemoData } from './data/demoDataGenerator.js';
import { createSharedGaitRuntime } from '../gait/sharedGaitRuntime.js';
import { Dashboard } from './ui/dashboard.js';
import { ChartsManager } from './ui/charts.js';
import { normalizeRealtimeSensorSample } from '../gateway/realtimeSensorUtils.js';
import {
  TRANSPORT_MODE_WEB_BLUETOOTH,
  connectBrowserBleDevice,
  createRealtimeConnection,
  getBrowserBleDevicesSnapshot,
  getRealtimeTransportMode,
  resetBrowserBleDevices,
  setRealtimeTransportMode,
  supportsRememberedBrowserBleDevices,
} from '../gateway/realtimeTransport.js';

const DEMO_PREFILL_SAMPLES = 400;
const DASHBOARD_BLE_SLOTS = ['LEFT_SHANK', 'RIGHT_SHANK'];
const REMOTE_RETRY_DELAY_MS = 1500;

function buildDemoSample(sample) {
  return {
    ...sample,
    sensorKey: 'demo-shank',
    side: 'R',
    sensorMount: 'shank',
    name: 'Demo Sensor',
  };
}

class GatewayStreamClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.listeners = [];
    this.statusListeners = [];
  }

  onData(callback) {
    this.listeners.push(callback);
  }

  onStatus(callback) {
    this.statusListeners.push(callback);
  }

  async connect() {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.disconnect();
    this._emitStatus('connecting');

    await new Promise((resolve, reject) => {
      this.ws = createRealtimeConnection();

      this.ws.onopen = () => {
        this.connected = true;
        this._emitStatus('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this._handleMessage(event);
      };

      this.ws.onerror = (error) => {
        this.connected = false;
        this._emitStatus('error');
        reject(error);
      };

      this.ws.onclose = () => {
        this.connected = false;
        this._emitStatus('disconnected');
      };
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
    }

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      this.ws.close();
    }

    this.ws = null;
    this.connected = false;
    this._emitStatus('disconnected');
  }

  _handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      if (message.type !== 'DATA') {
        return;
      }

      const sample = normalizeRealtimeSensorSample(message.payload || {});
      if (!sample) {
        return;
      }

      this.listeners.forEach((callback) => callback(sample));
    } catch {
      this._emitStatus('error');
    }
  }

  _emitStatus(status) {
    this.statusListeners.forEach((callback) => callback(status));
  }
}

export class GaitLabDashboardApp {
  constructor(options = {}) {
    this.options = {
      teardownTransportOnDestroy: true,
      streamFactory: null,
      broadcastPublisherFactory: null,
      initialMode: 'auto',
      ...options,
    };

    this.stream = typeof this.options.streamFactory === 'function'
      ? this.options.streamFactory()
      : new GatewayStreamClient();
    this.broadcastPublisher = typeof this.options.broadcastPublisherFactory === 'function'
      ? this.options.broadcastPublisherFactory()
      : null;
    this.gaitRuntime = createSharedGaitRuntime();
    this.dashboard = new Dashboard();
    this.charts = new ChartsManager();

    this.mode = 'demo';
    this.demoStream = null;
    this.loadingTimer = null;
    this.remoteRetryTimer = null;

    this.gaitRuntime.onParams(() => {
      this._renderDashboard();
    });
    this.gaitRuntime.onVisibilityChange(({ sensorSummary }) => {
      this.dashboard.updateSensorSummary(sensorSummary);
    });
  }

  init() {
    this.dashboard.init();
    this.charts.init();

    this.stream.onStatus((status) => {
      this.dashboard.updateStatus(status);
      void this._publishBroadcastStatus(status);
    });

    this.stream.onData((sample) => {
      this._ingestSensorSample(sample);
      this._enqueueBroadcastSample(sample);
    });

    this._bindEvents();
    this._startInitialMode();

    if (this.loadingTimer) {
      window.clearTimeout(this.loadingTimer);
    }
    this.loadingTimer = window.setTimeout(() => {
      document.getElementById('loading-overlay')?.classList.add('hidden');
      this.loadingTimer = null;
    }, 800);
  }

  async startDemo() {
    this.stopAll();
    await resetBrowserBleDevices();
    setRealtimeTransportMode(TRANSPORT_MODE_WEB_BLUETOOTH);
    this.mode = 'demo';
    this.dashboard.setMode('demo');
    this.dashboard.updateStatus('demo');

    const { samples } = generateWalkingData({ numStrides: 8 });
    const prefillSamples = samples.slice(0, DEMO_PREFILL_SAMPLES);
    prefillSamples.forEach((sample) => {
      this._ingestSensorSample(buildDemoSample(sample));
    });
    this.gaitRuntime.analyzeReadyProcessors();

    this.demoStream = streamDemoData((sample) => {
      this._ingestSensorSample(buildDemoSample(sample));
    });

    this.gaitRuntime.startAnalysisLoop();
  }

  async startRemote(options = {}) {
    const { suppressErrorLog = false } = options;

    try {
      this.stopAll();
      this.mode = 'remote-broadcast';
      this.dashboard.setMode(this.mode);
      this.dashboard.updateStatus('connecting');

      await this.stream.connect();

      this.gaitRuntime.startAnalysisLoop();
    } catch (error) {
      if (!suppressErrorLog) {
        console.error('Remote live stream failed:', error);
      }
      this.dashboard.updateStatus('error');

      if (!this.remoteRetryTimer && this.mode === 'remote-broadcast') {
        this.remoteRetryTimer = window.setTimeout(() => {
          this.remoteRetryTimer = null;
          void this.startRemote({ suppressErrorLog: true });
        }, REMOTE_RETRY_DELAY_MS);
      }
    }
  }

  async startLive(options = {}) {
    const {
      fallbackToDemo = true,
      suppressErrorLog = false,
      transportMode = TRANSPORT_MODE_WEB_BLUETOOTH,
      pairBrowserBle = false,
      preferKnownDevice = false,
      pickerFallback = true,
    } = options;

    try {
      this.stopAll();
      setRealtimeTransportMode(transportMode);

      this.mode = 'browser-ble';
      this.dashboard.setMode(this.mode);

      await this._connectBroadcastPublisher();
      await this.stream.connect();

      if (pairBrowserBle) {
        if (transportMode === TRANSPORT_MODE_WEB_BLUETOOTH && this._hasConnectedDashboardSensor()) {
          this.dashboard.updateStatus('connected');
        } else {
          this.dashboard.updateStatus('pairing');
          await this._connectPreferredBrowserBleSensors({ preferKnownDevice, pickerFallback });
          this.dashboard.updateStatus('connected');
        }
      }

      this.gaitRuntime.startAnalysisLoop();
    } catch (error) {
      if (!suppressErrorLog) {
        console.error('Realtime stream failed:', error);
      }
      this.dashboard.updateStatus('error');

      if (fallbackToDemo) {
        window.setTimeout(() => {
          void this.startDemo();
        }, 500);
      }
    }
  }

  async startBrowserBle(options = {}) {
    const {
      fallbackToDemo = false,
      suppressErrorLog = false,
      preferKnownDevice = true,
      pickerFallback = true,
    } = options;

    await this.startLive({
      fallbackToDemo,
      suppressErrorLog,
      transportMode: TRANSPORT_MODE_WEB_BLUETOOTH,
      pairBrowserBle: true,
      preferKnownDevice,
      pickerFallback,
    });
  }

  stopAll() {
    if (this.demoStream) {
      this.demoStream.stop();
      this.demoStream = null;
    }

    this.gaitRuntime.stopAnalysisLoop();

    if (this.remoteRetryTimer) {
      window.clearTimeout(this.remoteRetryTimer);
      this.remoteRetryTimer = null;
    }

    if (typeof this.stream.disconnect === 'function') {
      this.stream.disconnect();
    }

    if (this.broadcastPublisher?.disconnect) {
      void this.broadcastPublisher.disconnect();
    }

    this.gaitRuntime.reset();
    this.dashboard.updateSensorSummary([]);
    this.dashboard.updateEvents([]);
    this.charts.update([]);
  }

  destroy() {
    this.stopAll();
    this.gaitRuntime.destroy();
    if (this.loadingTimer) {
      window.clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
    if (this.options.teardownTransportOnDestroy) {
      void resetBrowserBleDevices();
      setRealtimeTransportMode(TRANSPORT_MODE_WEB_BLUETOOTH);
    }
    this.charts.destroy();
  }

  _startInitialMode() {
    if (this.options.initialMode === 'remote-broadcast') {
      void this.startRemote({ suppressErrorLog: true });
      return;
    }

    if (getRealtimeTransportMode() === TRANSPORT_MODE_WEB_BLUETOOTH) {
      if (this._hasConnectedDashboardSensor()) {
        void this.startLive({
          fallbackToDemo: true,
          suppressErrorLog: true,
          transportMode: TRANSPORT_MODE_WEB_BLUETOOTH,
          pairBrowserBle: false,
        });
        return;
      }

      if (supportsRememberedBrowserBleDevices()) {
        void this.startBrowserBle({
          fallbackToDemo: true,
          suppressErrorLog: true,
          preferKnownDevice: true,
          pickerFallback: false,
        });
        return;
      }
    }

    void this.startDemo();
  }

  _hasConnectedDashboardSensor() {
    return getBrowserBleDevicesSnapshot().some((device) => (
      DASHBOARD_BLE_SLOTS.includes(device.positionId) && device.status === 'connected'
    ));
  }

  async _connectPreferredBrowserBleSensors({ preferKnownDevice, pickerFallback }) {
    let connectedCount = 0;
    let lastError = null;

    for (const positionId of DASHBOARD_BLE_SLOTS) {
      try {
        await connectBrowserBleDevice(positionId, {
          preferKnownDevice,
          pickerFallback,
        });
        connectedCount += 1;
      } catch (error) {
        lastError = error;
      }
    }

    if (!connectedCount) {
      throw lastError || new Error('No shank sensor could be connected for the dashboard.');
    }
  }

  _ingestSensorSample(sample) {
    const normalizedSample = normalizeRealtimeSensorSample(sample);
    if (!normalizedSample) {
      return;
    }

    this.gaitRuntime.ingestSample(normalizedSample);
  }

  _renderDashboard() {
    const entries = this.gaitRuntime.getChartEntries();

    if (!entries.length) {
      this.dashboard.updateEvents([]);
      this.charts.update([]);
      return;
    }

    if (entries.length === 1) {
      this.dashboard.updateParams(entries[0].params);
    } else {
      this.dashboard.updateMultiSensorParams(entries);
    }

    this.dashboard.updateEvents(this.gaitRuntime.getAllEvents());
    this.charts.update(entries);
  }

  _bindEvents() {
    document.getElementById('mode-toggle')?.addEventListener('click', () => {
      if (this.mode === 'demo') {
        void this.startBrowserBle();
      } else {
        void this.startDemo();
      }
    });

    document.getElementById('btn-connect')?.addEventListener('click', () => {
      if (this.mode === 'browser-ble') {
        void this.startDemo();
      } else {
        void this.startBrowserBle();
      }
    });

    document.getElementById('btn-demo')?.addEventListener('click', () => {
      void this.startDemo();
    });
  }

  async _connectBroadcastPublisher() {
    if (!this.broadcastPublisher?.connect) {
      return;
    }

    try {
      await this.broadcastPublisher.connect();
    } catch (error) {
      console.warn('Live gait broadcast is unavailable:', error);
    }
  }

  _enqueueBroadcastSample(sample) {
    if (!this.broadcastPublisher?.enqueueSample) {
      return;
    }

    try {
      this.broadcastPublisher.enqueueSample(sample);
    } catch (error) {
      console.warn('Failed to enqueue live gait sample:', error);
    }
  }

  async _publishBroadcastStatus(status) {
    if (!this.broadcastPublisher?.publishStatus) {
      return;
    }

    try {
      await this.broadcastPublisher.publishStatus(status);
    } catch (error) {
      console.warn('Failed to publish live gait status:', error);
    }
  }
}

export function createGaitLabDashboardApp(options) {
  return new GaitLabDashboardApp(options);
}