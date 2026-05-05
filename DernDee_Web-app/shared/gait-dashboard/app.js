import { generateWalkingData, streamDemoData } from './data/demoDataGenerator.js';
import { createGaitProcessorClient } from '../gait/gaitProcessorClient.js';
import { Dashboard } from './ui/dashboard.js';
import { ChartsManager } from './ui/charts.js';
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

const ANALYSIS_INTERVAL_MS = 1000;
const MIN_ANALYSIS_SAMPLES = 300;
const DEMO_PREFILL_SAMPLES = 400;
const DASHBOARD_BLE_SLOT = 'RIGHT_SHANK';

class GatewayStreamClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.activeSensorKey = null;
    this.activeSensorMount = null;
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
        this.activeSensorKey = null;
        this.activeSensorMount = null;
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
    this.activeSensorKey = null;
    this.activeSensorMount = null;
    this._emitStatus('disconnected');
  }

  _handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      if (message.type !== 'DATA') {
        return;
      }

      const payload = message.payload || {};
      if (!Array.isArray(payload.raw_accel) || !Array.isArray(payload.raw_gyro)) {
        return;
      }

      const streamKey = payload.position_id || payload.name || null;
      const isPreferredSensor = payload.sensor_mount === 'shank';
      if (!this.activeSensorKey) {
        this.activeSensorKey = streamKey;
        this.activeSensorMount = payload.sensor_mount || 'unknown';
      } else if (isPreferredSensor && this.activeSensorMount !== 'shank' && streamKey && streamKey !== this.activeSensorKey) {
        this.activeSensorKey = streamKey;
        this.activeSensorMount = 'shank';
      }

      if (!streamKey || streamKey !== this.activeSensorKey) {
        return;
      }

      const [ax, ay, az] = payload.raw_accel;
      const [gx, gy, gz] = payload.raw_gyro;

      this.listeners.forEach((callback) => callback({
        ax,
        ay,
        az,
        gx,
        gy,
        gz,
      }));
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
    this.processor = createGaitProcessorClient();
    this.dashboard = new Dashboard();
    this.charts = new ChartsManager();

    this.mode = 'demo';
    this.demoStream = null;
    this.analysisTimer = null;
    this.loadingTimer = null;
    this.sampleCount = 0;
  }

  init() {
    this.dashboard.init();
    this.charts.init();

    this.processor.onParams(({ params, processedData }) => {
      if (params) {
        this.dashboard.updateParams(params);
      }
      this.dashboard.updateEvents(processedData.events);
      this.charts.update(processedData, params);
    });

    this.stream.onStatus((status) => {
      this.dashboard.updateStatus(status);
      void this._publishBroadcastStatus(status);
    });

    this.stream.onData((sample) => {
      this.processor.addSample(sample);
      this.sampleCount += 1;
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
    this.sampleCount = 0;

    const { samples } = generateWalkingData({ numStrides: 8 });
    const prefillSamples = samples.slice(0, DEMO_PREFILL_SAMPLES);
    prefillSamples.forEach((sample) => {
      this.processor.addSample(sample);
    });
    this.sampleCount = prefillSamples.length;
    this.processor.analyze();

    this.demoStream = streamDemoData((sample) => {
      this.processor.addSample(sample);
      this.sampleCount += 1;
    });

    this.analysisTimer = window.setInterval(() => {
      if (this.sampleCount >= MIN_ANALYSIS_SAMPLES) {
        this.processor.analyze();
      }
    }, ANALYSIS_INTERVAL_MS);
  }

  async startRemote(options = {}) {
    const { suppressErrorLog = false } = options;

    try {
      this.stopAll();
      this.mode = 'remote-broadcast';
      this.dashboard.setMode(this.mode);
      this.dashboard.updateStatus('connecting');
      this.sampleCount = 0;

      await this.stream.connect();

      this.analysisTimer = window.setInterval(() => {
        if (this.sampleCount >= MIN_ANALYSIS_SAMPLES) {
          this.processor.analyze();
        }
      }, ANALYSIS_INTERVAL_MS);
    } catch (error) {
      if (!suppressErrorLog) {
        console.error('Remote live stream failed:', error);
      }
      this.dashboard.updateStatus('error');
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
      this.sampleCount = 0;

      await this._connectBroadcastPublisher();
      await this.stream.connect();

      if (pairBrowserBle) {
        if (transportMode === TRANSPORT_MODE_WEB_BLUETOOTH && this._hasConnectedDashboardSensor()) {
          this.dashboard.updateStatus('connected');
        } else {
          this.dashboard.updateStatus('pairing');
          await connectBrowserBleDevice(DASHBOARD_BLE_SLOT, {
            preferKnownDevice,
            pickerFallback,
          });
          this.dashboard.updateStatus('connected');
        }
      }

      this.analysisTimer = window.setInterval(() => {
        if (this.sampleCount >= MIN_ANALYSIS_SAMPLES) {
          this.processor.analyze();
        }
      }, ANALYSIS_INTERVAL_MS);
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

    if (this.analysisTimer) {
      window.clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    if (this.stream.connected) {
      this.stream.disconnect();
    }

    if (this.broadcastPublisher?.disconnect) {
      void this.broadcastPublisher.disconnect();
    }

    this.processor.reset();
  }

  destroy() {
    this.stopAll();
    if (this.loadingTimer) {
      window.clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
    if (this.options.teardownTransportOnDestroy) {
      void resetBrowserBleDevices();
      setRealtimeTransportMode(TRANSPORT_MODE_WEB_BLUETOOTH);
    }
    this.processor.destroy();
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
      device.positionId === DASHBOARD_BLE_SLOT && device.status === 'connected'
    ));
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