/**
 * Charts Manager - Real-time Chart Rendering
 */

import {
  Chart,
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(
  LineController,
  BarController,
  LineElement,
  BarElement,
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

export class ChartsManager {
  constructor() {
    this.angVelChart = null;
    this.angleChart = null;
    this.strideChart = null;
  }

  init() {
    this._createAngVelChart();
    this._createAngleChart();
    this._createStrideChart();
  }

  update(processedData, params) {
    this._updateAngVelChart(processedData);
    this._updateAngleChart(processedData);
    this._updateStrideChart(params);
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
            ...commonScaleOptions,
            title: { display: true, text: 'Time (s)', font: { size: 10, weight: '600' }, color: '#757575' },
          },
          y: {
            ...commonScaleOptions,
            title: { display: true, text: 'Angular Velocity (deg/s)', font: { size: 10, weight: '600' }, color: '#757575' },
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

    const labels = [];
    const angVelData = [];
    for (let i = startIdx; i < data.timestamps.length; i += 1) {
      labels.push(data.timestamps[i].toFixed(2));
      angVelData.push(data.angularVelocity[i]);
    }

    const hsData = [];
    const toData = [];
    const msvData = [];

    for (const event of data.events) {
      if (event.index < startIdx) {
        continue;
      }
      const chartIdx = event.index - startIdx;
      if (chartIdx < 0 || chartIdx >= labels.length) {
        continue;
      }

      const point = { x: labels[chartIdx], y: data.angularVelocity[event.index] };
      if (event.type === 'HS') {
        hsData.push(point);
      } else if (event.type === 'TO') {
        toData.push(point);
      } else if (event.type === 'MSV') {
        msvData.push(point);
      }
    }

    this.angVelChart.data.labels = labels;
    this.angVelChart.data.datasets[0].data = angVelData;
    this.angVelChart.data.datasets[1].data = hsData;
    this.angVelChart.data.datasets[2].data = toData;
    this.angVelChart.data.datasets[3].data = msvData;
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
            ...commonScaleOptions,
            title: { display: true, text: 'Time (s)', font: { size: 10, weight: '600' }, color: '#757575' },
          },
          y: {
            ...commonScaleOptions,
            title: { display: true, text: 'Angle (deg)', font: { size: 10, weight: '600' }, color: '#757575' },
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

    const labels = [];
    const angleData = [];
    for (let i = startIdx; i < data.timestamps.length; i += 1) {
      labels.push(data.timestamps[i].toFixed(2));
      angleData.push(data.shankAngle[i]);
    }

    this.angleChart.data.labels = labels;
    this.angleChart.data.datasets[0].data = angleData;
    this.angleChart.update('none');
  }

  _createStrideChart() {
    const ctx = document.getElementById('chart-stride').getContext('2d');

    this.strideChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Stride Length',
          data: [],
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx: canvasCtx, chartArea } = chart;
            if (!chartArea) {
              return CHART_COLORS.emerald;
            }
            const gradient = canvasCtx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, 'rgba(76, 175, 80, 0.3)');
            gradient.addColorStop(1, 'rgba(76, 175, 80, 0.7)');
            return gradient;
          },
          borderColor: CHART_COLORS.emerald,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#212121',
            bodyColor: '#424242',
            borderColor: '#e0e0e0',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
            callbacks: {
              label: (ctx) => `Stride: ${ctx.parsed.y?.toFixed(2)} m`,
            },
          },
        },
        scales: {
          x: {
            ...commonScaleOptions,
            title: { display: true, text: 'Stride #', font: { size: 10, weight: '600' }, color: '#757575' },
          },
          y: {
            ...commonScaleOptions,
            title: { display: true, text: 'Length (m)', font: { size: 10, weight: '600' }, color: '#757575' },
            suggestedMin: 0,
            suggestedMax: 2.0,
          },
        },
      },
    });
  }

  _updateStrideChart(params) {
    if (!this.strideChart || !params) {
      return;
    }

    const strides = params.strideLengths || [];
    const labels = strides.map((_, i) => `#${i + 1}`);

    this.strideChart.data.labels = labels;
    this.strideChart.data.datasets[0].data = strides;
    this.strideChart.update('none');
  }

  destroy() {
    this.angVelChart?.destroy();
    this.angleChart?.destroy();
    this.strideChart?.destroy();
  }
}