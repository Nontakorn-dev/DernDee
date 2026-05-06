/**
 * Dashboard UI Controller
 *
 * Manages parameter display, event log, mode switching,
 * and connection status for the medical dashboard layout.
 */

function formatMaybeNumber(value, digits = 1, fallback = '-') {
  return Number.isFinite(value) ? value.toFixed(digits) : fallback;
}

function formatMetricBySide(entries, selector, digits = 1, suffix = '') {
  return entries.map((entry) => {
    const value = selector(entry.params || {});
    const label = entry.side === 'L' ? 'L' : entry.side === 'R' ? 'R' : entry.label;
    const formattedValue = Number.isFinite(value) ? value.toFixed(digits) : '-';
    return `${label}: ${formattedValue}${suffix}`;
  }).join(' / ');
}

function buildAverageParams(entries) {
  if (!entries.length) {
    return null;
  }

  const averaged = {
    stepCount: 0,
    strideCount: 0,
    sessionDuration: 0,
    cadence: 0,
    stepTime: null,
    strideTime: 0,
    doubleSupport: null,
    stepLength: 0,
    strideLength: 0,
    walkingSpeed: 0,
    peakShankAngle: 0,
    stancePct: 0,
    swingPct: 0,
  };

  const numericFields = [
    'sessionDuration',
    'cadence',
    'strideTime',
    'stepLength',
    'strideLength',
    'walkingSpeed',
    'peakShankAngle',
    'stancePct',
    'swingPct',
  ];

  numericFields.forEach((field) => {
    const values = entries
      .map((entry) => entry.params?.[field])
      .filter(Number.isFinite);
    averaged[field] = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  });

  averaged.stepCount = Math.max(...entries.map((entry) => entry.params?.stepCount || 0));
  averaged.strideCount = Math.max(...entries.map((entry) => entry.params?.strideCount || 0));

  const stepTimeValues = entries
    .map((entry) => entry.params?.stepTime)
    .filter(Number.isFinite);
  averaged.stepTime = stepTimeValues.length
    ? stepTimeValues.reduce((sum, value) => sum + value, 0) / stepTimeValues.length
    : null;

  const doubleSupportValues = entries
    .map((entry) => entry.params?.doubleSupport)
    .filter(Number.isFinite);
  averaged.doubleSupport = doubleSupportValues.length
    ? doubleSupportValues.reduce((sum, value) => sum + value, 0) / doubleSupportValues.length
    : null;

  return averaged;
}

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
    this.sensorSummary = document.getElementById('sensor-side-summary');
  }

  updateParams(params) {
    if (!params) {
      return;
    }

    this._animateValue('stepCount', String(params.stepCount || 0));
    this._animateValue('strideCount', String(params.strideCount || 0));
    this._animateValue('sessionDuration', formatMaybeNumber(params.sessionDuration, 1, '0.0'));

    this._animateValue('cadence', formatMaybeNumber(params.cadence, 1));
    this._animateValue('stepTime', formatMaybeNumber(params.stepTime, 2));
    this._animateValue('strideTime', formatMaybeNumber(params.strideTime, 2));
    this._animateValue('doubleSupport', formatMaybeNumber(params.doubleSupport, 2));

    this._animateValue('stepLength', formatMaybeNumber(params.stepLength, 2));
    this._animateValue('strideLength', formatMaybeNumber(params.strideLength, 2));
    this._animateValue('walkingSpeed', formatMaybeNumber(params.walkingSpeed, 2));

    this._animateValue('peakAngle', formatMaybeNumber(params.peakShankAngle, 1));
    this._animateValue('stancePct', formatMaybeNumber(params.stancePct, 1));
    this._animateValue('swingPct', formatMaybeNumber(params.swingPct, 1));

    if (this.stanceBar) {
      this.stanceBar.style.width = `${params.stancePct || 0}%`;
      this.swingBar.style.width = `${params.swingPct || 0}%`;
      this.stancePctLabel.textContent = `Stance ${formatMaybeNumber(params.stancePct, 1, '0.0')}%`;
      this.swingPctLabel.textContent = `Swing ${formatMaybeNumber(params.swingPct, 1, '0.0')}%`;
    }
  }

  updateMultiSensorParams(entries) {
    if (!entries?.length) {
      return;
    }

    const averaged = buildAverageParams(entries);
    this.updateParams(averaged);

    this._animateValue('cadence', formatMetricBySide(entries, (params) => params.cadence, 1));
    this._animateValue('stepTime', formatMetricBySide(entries, (params) => params.stepTime, 2));
    this._animateValue('strideTime', formatMetricBySide(entries, (params) => params.strideTime, 2));
    this._animateValue('doubleSupport', formatMetricBySide(entries, (params) => params.doubleSupport, 2));
    this._animateValue('stepLength', formatMetricBySide(entries, (params) => params.stepLength, 2));
    this._animateValue('strideLength', formatMetricBySide(entries, (params) => params.strideLength, 2));
    this._animateValue('walkingSpeed', formatMetricBySide(entries, (params) => params.walkingSpeed, 2));
    this._animateValue('peakAngle', formatMetricBySide(entries, (params) => params.peakShankAngle, 1));
    this._animateValue('stancePct', formatMetricBySide(entries, (params) => params.stancePct, 1));
    this._animateValue('swingPct', formatMetricBySide(entries, (params) => params.swingPct, 1));

    const avgStance = averaged?.stancePct || 0;
    const avgSwing = averaged?.swingPct || 0;
    if (this.stanceBar) {
      this.stanceBar.style.width = `${avgStance}%`;
      this.swingBar.style.width = `${avgSwing}%`;
      this.stancePctLabel.textContent = `Avg stance ${formatMaybeNumber(avgStance, 1, '0.0')}%`;
      this.swingPctLabel.textContent = `Avg swing ${formatMaybeNumber(avgSwing, 1, '0.0')}%`;
    }
  }

  updateSensorSummary(sensors = []) {
    if (!this.sensorSummary) {
      return;
    }

    if (!sensors.length) {
      this.sensorSummary.innerHTML = '<span class="sensor-summary-empty">Waiting for sensor data</span>';
      return;
    }

    this.sensorSummary.innerHTML = sensors.map((sensor) => {
      const sideClass = sensor.side === 'L' ? 'left' : sensor.side === 'R' ? 'right' : 'neutral';
      const sideLabel = sensor.side === 'L' ? 'Left' : sensor.side === 'R' ? 'Right' : 'Sensor';
      return `<span class="sensor-summary-pill ${sideClass}">
        <span class="sensor-summary-side">${sideLabel}</span>
        <span class="sensor-summary-label">${sensor.label}</span>
      </span>`;
    }).join('');
  }

  updateEvents(events = []) {
    if (!this.eventList) {
      return;
    }

    if (!events.length) {
      this.eventList.innerHTML = '';
      return;
    }

    const recentEvents = events.slice(-20);
    this.eventList.innerHTML = recentEvents.map((event) => {
      const typeClass = event.type.toLowerCase();
      const sideClass = event.side === 'L' ? 'left' : event.side === 'R' ? 'right' : 'neutral';
      const sideLabel = event.side === 'L' ? 'L' : event.side === 'R' ? 'R' : 'Sensor';
      return `<span class="event-tag ${typeClass}">
        <span class="event-side ${sideClass}">${sideLabel}</span>
        <span>${event.type}</span>
        <span style="opacity:0.7">${event.time.toFixed(2)}s</span>
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
        'remote-broadcast': 'Remote Live',
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