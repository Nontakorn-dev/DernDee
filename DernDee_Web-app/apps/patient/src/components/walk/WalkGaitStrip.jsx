import React from 'react';

function formatMetric(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function WalkStatCard({ label, value, unit, large = false }) {
  return (
    <div
      className={`rounded-2xl border border-white/60 bg-white/70 text-center shadow-lg shadow-blue-900/5 backdrop-blur-md ${
        large ? 'px-5 py-6 sm:px-6 sm:py-8' : 'px-4 py-4 sm:px-5 sm:py-5'
      }`}
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
        {label}
      </div>
      <div
        className={`font-black tabular-nums text-blue-600 ${
          large ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'
        }`}
      >
        {value}
        {unit && (
          <span className={`ml-0.5 font-bold text-slate-400 ${large ? 'text-base' : 'text-sm'}`}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

const WalkGaitStrip = ({ stepCm, cadenceSpm, speedMps, layout = 'row' }) => {
  const metrics = [
    { label: 'Step', value: formatMetric(stepCm, 0), unit: 'cm' },
    { label: 'Cadence', value: formatMetric(cadenceSpm, 0), unit: null },
    { label: 'Speed', value: formatMetric(speedMps, 2), unit: 'm/s' },
  ];

  if (layout === 'column') {
    return (
      <div className="flex h-full flex-col justify-center gap-3">
        {metrics.map((metric) => (
          <WalkStatCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            unit={metric.unit}
            large={metric.label === 'Speed'}
          />
        ))}
      </div>
    );
  }

  if (layout === 'left') {
    return (
      <div className="flex flex-col justify-center gap-3">
        <WalkStatCard label="Step" value={formatMetric(stepCm, 0)} unit="cm" large />
        <WalkStatCard label="Cadence" value={formatMetric(cadenceSpm, 0)} unit={null} large />
      </div>
    );
  }

  if (layout === 'right') {
    return (
      <div className="flex h-full flex-col justify-center">
        <WalkStatCard
          label="Speed"
          value={formatMetric(speedMps, 2)}
          unit="m/s"
          large
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {metrics.map((metric) => (
        <WalkStatCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          unit={metric.unit}
        />
      ))}
    </div>
  );
};

export default WalkGaitStrip;
