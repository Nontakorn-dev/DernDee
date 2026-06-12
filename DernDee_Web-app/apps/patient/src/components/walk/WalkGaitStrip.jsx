import React from 'react';

function formatMetric(value, digits = 0, suffix = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '--';
}

const WalkGaitStrip = ({ stepCm, cadenceSpm, speedMps }) => {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-white rounded-2xl shadow-xl p-4 text-center">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Step</div>
        <div className="text-2xl font-black text-blue-600 tabular-nums">
          {formatMetric(stepCm, 0)}
          <span className="text-sm text-gray-400 ml-0.5">cm</span>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-xl p-4 text-center">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Cadence</div>
        <div className="text-2xl font-black text-blue-600 tabular-nums">
          {formatMetric(cadenceSpm, 0)}
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-xl p-4 text-center">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Speed</div>
        <div className="text-2xl font-black text-blue-600 tabular-nums">
          {formatMetric(speedMps, 2)}
          <span className="text-sm text-gray-400 ml-0.5">m/s</span>
        </div>
      </div>
    </div>
  );
};

export default WalkGaitStrip;
