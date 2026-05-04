/**
 * Charts Manager - Real-time Chart Rendering
 */

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
);

Chart.defaults.color = '#757575';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;

const CHART_COLORS = {
  primary: 'rgba(33, 150, 243, 1)',
  primaryDim: 'rgba(33, 150, 243, 0.1)',
  coral: 'rgba(239, 83, 80, 1)',
  amber: 'rgba(255, 152, 0, 1)',
  emerald: 'rgba(76, 175, 80, 1)',
  violet: 'rgba(124, 77, 255, 1)',
  violetDim: 'rgba(124, 77, 255, 0.1)',
  gridColor: 'rgba(0, 0, 0, 0.06)',
};

const commonScaleOptions = {
  grid: {
    color: CHART_COLORS.gridColor,
    drawTicks: false,
  },
  ticks: {
    padding: 8,
    font: { size: 10 },
  },
  border: {
    display: false,
  },
};

const ANGULAR_VELOCITY_SCALE = {
  min: -400,
  max: 400,
  stepSize: 100,
};

const SHANK_ANGLE_SCALE = {
  min: -45,
  max: 45,
  stepSize: 15,
};

function formatTimeTick(value) {
  return Number.isFinite(value) ? value.toFixed(2) : value;
}

function buildSeriesPoints(timestamps, values, startIdx = 0) {
  const points = [];

  for (let i = startIdx; i < timestamps.length; i += 1) {
    if (!Number.isFinite(timestamps[i]) || !Number.isFinite(values[i])) {
      continue;
    }

    points.push({ x: timestamps[i], y: values[i] });
  }

  return points;
}

function buildVerticalLineData(xValue, yMin, yMax) {
  if (!Number.isFinite(xValue) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return [];
  }

  return [
    { x: xValue, y: yMin },
    { x: xValue, y: yMax },
  ];
}

function getStableScaleRange(values, baseRange) {
  const numericValues = values.filter(Number.isFinite);

  if (!numericValues.length) {
    return baseRange;
  }

  let min = baseRange.min;
  let max = baseRange.max;

  const dataMin = Math.min(...numericValues);
  const dataMax = Math.max(...numericValues);

  if (dataMin < min) {
    min = Math.floor(dataMin / baseRange.stepSize) * baseRange.stepSize;
  }

  if (dataMax > max) {
    max = Math.ceil(dataMax / baseRange.stepSize) * baseRange.stepSize;
  }

  return {
    min,
    max,
    stepSize: baseRange.stepSize,
  };
}

export class ChartsManager {
  constructor() {
    this.angVelChart = null;
    this.angleChart = null;
  }

  init() {
    this._createAngVelChart();
    this._createAngleChart();
  }

  update(processedData, params) {
    this._updateAngVelChart(processedData);
    this._updateAngleChart(processedData);
  }

  _createAngVelChart() {
    const ctx = document.getElementById('chart-angvel').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, CHART_COLORS.primaryDim);
    gradient.addColorStop(1, 'rgba(33, 150, 243, 0.01)');

    this.angVelChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Angular Velocity',
            data: [],
            borderColor: CHART_COLORS.primary,
            backgroundColor: gradient,
            borderWidth: 1.5,
            pointRadius: 0,
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Heel Strike',
            data: [],
            borderColor: CHART_COLORS.coral,
            backgroundColor: CHART_COLORS.coral,
            pointRadius: 6,
            pointStyle: 'triangle',
            showLine: false,
            pointBorderWidth: 0,
          },
          {
            label: 'Toe Off',
            data: [],
            borderColor: CHART_COLORS.amber,
            backgroundColor: CHART_COLORS.amber,
            pointRadius: 5,
            pointStyle: 'rect',
            showLine: false,
            pointBorderWidth: 0,
          },
          {
            label: 'Mid-Stance',
            data: [],
            borderColor: CHART_COLORS.emerald,
            backgroundColor: CHART_COLORS.emerald,
            pointRadius: 5,
            pointStyle: 'circle',
            showLine: false,
            pointBorderWidth: 0,
          },
          {
            label: 'Integration Start',
            data: [],
            borderColor: 'rgba(25, 118, 210, 0.85)',
            backgroundColor: 'rgba(25, 118, 210, 0.85)',
            borderWidth: 1.25,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
          },
          {
            label: 'Integration End',
            data: [],
            borderColor: 'rgba(56, 142, 60, 0.85)',
            backgroundColor: 'rgba(56, 142, 60, 0.85)',
            borderWidth: 1.25,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 12,
              font: { size: 10, weight: '600' },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#212121',
            bodyColor: '#424242',
            borderColor: '#e0e0e0',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
            displayColors: true,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)} deg/s`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            ...commonScaleOptions,
            title: { display: true, text: 'Time (s)', font: { size: 10, weight: '600' }, color: '#757575' },
            ticks: {
              ...commonScaleOptions.ticks,
              callback: (value) => formatTimeTick(value),
            },
          },
          y: {
            ...commonScaleOptions,
            title: { display: true, text: 'Angular Velocity (deg/s)', font: { size: 10, weight: '600' }, color: '#757575' },
            min: ANGULAR_VELOCITY_SCALE.min,
            max: ANGULAR_VELOCITY_SCALE.max,
            ticks: {
              ...commonScaleOptions.ticks,
              stepSize: ANGULAR_VELOCITY_SCALE.stepSize,
            },
          },
        },
      },
    });
  }

  _updateAngVelChart(data) {
    if (!this.angVelChart || !data.timestamps.length) {
      return;
    }

    const showSamples = 400;
    const startIdx = Math.max(0, data.timestamps.length - showSamples);
    const angVelPoints = buildSeriesPoints(data.timestamps, data.angularVelocity, startIdx);
    const visibleStartTime = data.timestamps[startIdx] ?? null;
    const visibleEndTime = data.timestamps[data.timestamps.length - 1] ?? null;

    const hsData = [];
    const toData = [];
    const msvData = [];

    for (const event of data.events) {
      if (event.index < startIdx || event.index >= data.timestamps.length) {
        continue;
      }

      const x = Number.isFinite(event.time) ? event.time : data.timestamps[event.index];
      const y = data.angularVelocity[event.index];

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }

      const point = { x, y };
      if (event.type === 'HS') {
        hsData.push(point);
      } else if (event.type === 'TO') {
        toData.push(point);
      } else if (event.type === 'MSV') {
        msvData.push(point);
      }
    }

    this.angVelChart.data.labels = [];
    this.angVelChart.data.datasets[0].data = angVelPoints;
    this.angVelChart.data.datasets[1].data = hsData;
    this.angVelChart.data.datasets[2].data = toData;
    this.angVelChart.data.datasets[3].data = msvData;

    const angVelScale = getStableScaleRange(angVelPoints.map((point) => point.y), ANGULAR_VELOCITY_SCALE);
    this.angVelChart.options.scales.y.min = angVelScale.min;
    this.angVelChart.options.scales.y.max = angVelScale.max;
    this.angVelChart.options.scales.x.min = visibleStartTime;
    this.angVelChart.options.scales.x.max = visibleEndTime;

    const integrationWindow = data.integrationWindow ?? null;
    this.angVelChart.data.datasets[4].data = buildVerticalLineData(
      integrationWindow?.startTime,
      angVelScale.min,
      angVelScale.max,
    );
    this.angVelChart.data.datasets[5].data = buildVerticalLineData(
      integrationWindow?.endTime,
      angVelScale.min,
      angVelScale.max,
    );

    this.angVelChart.update('none');
  }

  _createAngleChart() {
    const ctx = document.getElementById('chart-angle').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, CHART_COLORS.violetDim);
    gradient.addColorStop(1, 'rgba(167, 139, 250, 0.01)');

    this.angleChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Shank Angle (Kalman)',
          data: [],
          borderColor: CHART_COLORS.violet,
          backgroundColor: gradient,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 12,
              font: { size: 10, weight: '600' },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#212121',
            bodyColor: '#424242',
            borderColor: '#e0e0e0',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
            callbacks: {
              label: (ctx) => `Angle: ${ctx.parsed.y?.toFixed(1)}deg`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            ...commonScaleOptions,
            title: { display: true, text: 'Time (s)', font: { size: 10, weight: '600' }, color: '#757575' },
            ticks: {
              ...commonScaleOptions.ticks,
              callback: (value) => formatTimeTick(value),
            },
          },
          y: {
            ...commonScaleOptions,
            title: { display: true, text: 'Angle (deg)', font: { size: 10, weight: '600' }, color: '#757575' },
            min: SHANK_ANGLE_SCALE.min,
            max: SHANK_ANGLE_SCALE.max,
            ticks: {
              ...commonScaleOptions.ticks,
              stepSize: SHANK_ANGLE_SCALE.stepSize,
            },
          },
        },
      },
    });
  }

  _updateAngleChart(data) {
    if (!this.angleChart || !data.timestamps.length) {
      return;
    }

    const showSamples = 400;
    const startIdx = Math.max(0, data.timestamps.length - showSamples);
    const anglePoints = buildSeriesPoints(data.timestamps, data.shankAngle, startIdx);
    const visibleStartTime = data.timestamps[startIdx] ?? null;
    const visibleEndTime = data.timestamps[data.timestamps.length - 1] ?? null;

    this.angleChart.data.labels = [];
    this.angleChart.data.datasets[0].data = anglePoints;

    const angleScale = getStableScaleRange(anglePoints.map((point) => point.y), SHANK_ANGLE_SCALE);
    this.angleChart.options.scales.y.min = angleScale.min;
    this.angleChart.options.scales.y.max = angleScale.max;
    this.angleChart.options.scales.x.min = visibleStartTime;
    this.angleChart.options.scales.x.max = visibleEndTime;

    this.angleChart.update('none');
  }

  destroy() {
    this.angVelChart?.destroy();
    this.angleChart?.destroy();
  }
}