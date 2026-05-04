/**
 * Dashboard UI Controller
 *
 * Manages parameter display, event log, mode switching,
 * and connection status for the medical dashboard layout.
 */

export class Dashboard {
  constructor() {
    this.paramElements = {};
    this.currentMode = 'demo';
    this.animationTimers = {};
  }

  init() {
    this.paramElements = {
      stepCount: document.getElementById('val-step-count'),
      strideCount: document.getElementById('val-stride-count'),
      sessionDuration: document.getElementById('val-session-duration'),
      cadence: document.getElementById('val-cadence'),
      stepTime: document.getElementById('val-step-time'),
      strideTime: document.getElementById('val-stride-time'),
      doubleSupport: document.getElementById('val-double-support'),
      stepLength: document.getElementById('val-step-length'),
      strideLength: document.getElementById('val-stride-length'),
      walkingSpeed: document.getElementById('val-walking-speed'),
      peakAngle: document.getElementById('val-peak-angle'),
      stancePct: document.getElementById('val-stance-pct'),
      swingPct: document.getElementById('val-swing-pct'),
    };

    this.stanceBar = document.getElementById('stance-bar');
    this.swingBar = document.getElementById('swing-bar');
    this.stancePctLabel = document.getElementById('stance-pct-label');
    this.swingPctLabel = document.getElementById('swing-pct-label');

    this.eventList = document.getElementById('event-list');
    this.statusIndicator = document.getElementById('status-indicator');
    this.statusText = document.getElementById('status-text');
    this.modeLabel = document.getElementById('mode-label');
  }

  updateParams(params) {
    if (!params) {
      return;
    }

    this._animateValue('stepCount', String(params.stepCount || 0));
    this._animateValue('strideCount', String(params.strideCount || 0));
    this._animateValue('sessionDuration', (params.sessionDuration || 0).toFixed(1));

    this._animateValue('cadence', params.cadence.toFixed(1));
    this._animateValue('stepTime', params.stepTime ? params.stepTime.toFixed(2) : '-');
    this._animateValue('strideTime', params.strideTime.toFixed(2));
    this._animateValue('doubleSupport', params.doubleSupport != null ? params.doubleSupport.toFixed(2) : '-');

    this._animateValue('stepLength', params.stepLength.toFixed(2));
    this._animateValue('strideLength', params.strideLength.toFixed(2));
    this._animateValue('walkingSpeed', params.walkingSpeed.toFixed(2));

    this._animateValue('peakAngle', params.peakShankAngle.toFixed(1));
    this._animateValue('stancePct', params.stancePct.toFixed(1));
    this._animateValue('swingPct', params.swingPct.toFixed(1));

    if (this.stanceBar) {
      this.stanceBar.style.width = `${params.stancePct}%`;
      this.swingBar.style.width = `${params.swingPct}%`;
      this.stancePctLabel.textContent = `Stance ${params.stancePct.toFixed(1)}%`;
      this.swingPctLabel.textContent = `Swing ${params.swingPct.toFixed(1)}%`;
    }
  }

  updateEvents(events) {
    if (!this.eventList || !events.length) {
      return;
    }

    const recentEvents = events.slice(-20);
    this.eventList.innerHTML = recentEvents.map((e) => {
      const typeClass = e.type.toLowerCase();
      return `<span class="event-tag ${typeClass}">
        <span>${e.type}</span>
        <span style="opacity:0.7">${e.time.toFixed(2)}s</span>
      </span>`;
    }).join('');
  }

  updateStatus(status) {
    if (!this.statusIndicator) {
      return;
    }

    this.statusIndicator.className = 'status-indicator';

    const labels = {
      demo: 'Demo Mode',
      connected: 'Connected',
      disconnected: 'Disconnected',
      scanning: 'Scanning...',
      connecting: 'Connecting...',
      pairing: 'Choose Sensor...',
      error: 'Error',
    };

    this.statusText.textContent = labels[status] || status;

    if (status === 'demo') {
      this.statusIndicator.classList.add('demo');
    } else if (status === 'connected') {
      this.statusIndicator.classList.add('connected');
    } else if (status === 'error') {
      this.statusIndicator.classList.add('error');
    }
  }

  setMode(mode) {
    this.currentMode = mode;
    if (this.modeLabel) {
      const labels = {
        demo: 'Demo',
        'browser-ble': 'Browser BLE',
      };
      this.modeLabel.textContent = labels[mode] || 'Live';
    }
  }

  activatePipelineStep() {
    // No longer used in the new layout.
  }

  _animateValue(key, newValue) {
    const el = this.paramElements[key];
    if (!el) {
      return;
    }

    const oldValue = el.textContent;
    if (oldValue === newValue) {
      return;
    }

    el.textContent = newValue;
    el.classList.add('updating');

    if (this.animationTimers[key]) {
      clearTimeout(this.animationTimers[key]);
    }

    this.animationTimers[key] = setTimeout(() => {
      el.classList.remove('updating');
    }, 400);
  }
}