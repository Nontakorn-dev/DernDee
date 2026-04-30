import './styles/main.css';
import { generateWalkingData, streamDemoData } from './data/demoDataGenerator.js';
import { GaitProcessor } from './data/gaitProcessor.js';
import { Dashboard } from './ui/dashboard.js';
import { ChartsManager } from './ui/charts.js';

const WS_URL = `ws://${window.location.hostname}:8765`;
const ANALYSIS_INTERVAL_MS = 1000;
const MIN_ANALYSIS_SAMPLES = 300;
const DEMO_PREFILL_SAMPLES = 400;

class GatewayStreamClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.activeSensorName = null;
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
      this.ws = new WebSocket(WS_URL);

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
        this.activeSensorName = null;
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
    this.activeSensorName = null;
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

      const isPreferredSensor = payload.sensor_mount === 'shank';
      if (!this.activeSensorName) {
        this.activeSensorName = payload.name;
        this.activeSensorMount = payload.sensor_mount || 'unknown';
      } else if (isPreferredSensor && this.activeSensorMount !== 'shank' && payload.name !== this.activeSensorName) {
        this.activeSensorName = payload.name;
        this.activeSensorMount = 'shank';
      }

      if (payload.name !== this.activeSensorName) {
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

class GaitLabDashboardApp {
  constructor() {
    this.stream = new GatewayStreamClient();
    this.processor = new GaitProcessor();
    this.dashboard = new Dashboard();
    this.charts = new ChartsManager();

    this.mode = 'demo';
    this.demoStream = null;
    this.analysisTimer = null;
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
    });

    this.stream.onData((sample) => {
      this.processor.addSample(sample);
      this.sampleCount += 1;
    });

    this._bindEvents();
    this.startLive({ fallbackToDemo: true, suppressErrorLog: true });

    setTimeout(() => {
      document.getElementById('loading-overlay')?.classList.add('hidden');
    }, 800);
  }

  startDemo() {
    this.stopAll();
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

  async startLive(options = {}) {
    const { fallbackToDemo = true, suppressErrorLog = false } = options;

    try {
      this.stopAll();
      this.mode = 'live';
      this.dashboard.setMode('live');
      this.sampleCount = 0;

      await this.stream.connect();

      this.analysisTimer = window.setInterval(() => {
        if (this.sampleCount >= MIN_ANALYSIS_SAMPLES) {
          this.processor.analyze();
        }
      }, ANALYSIS_INTERVAL_MS);
    } catch (error) {
      if (!suppressErrorLog) {
        console.error('Shared gateway stream failed:', error);
      }
      this.dashboard.updateStatus('error');

      if (fallbackToDemo) {
        window.setTimeout(() => {
          this.startDemo();
        }, 500);
      }
    }
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

    this.processor.reset();
  }

  destroy() {
    this.stopAll();
    this.charts.destroy();
  }

  _bindEvents() {
    document.getElementById('mode-toggle')?.addEventListener('click', () => {
      if (this.mode === 'demo') {
        this.startLive();
      } else {
        this.startDemo();
      }
    });

    document.getElementById('btn-connect')?.addEventListener('click', () => {
      if (this.stream.connected) {
        this.startDemo();
      } else {
        this.startLive();
      }
    });

    document.getElementById('btn-demo')?.addEventListener('click', () => {
      this.startDemo();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new GaitLabDashboardApp();
  app.init();

  window.addEventListener('beforeunload', () => {
    app.destroy();
  });
});