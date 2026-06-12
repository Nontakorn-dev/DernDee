import React from 'react';

function pillClass(active, tone = 'neutral') {
  if (!active) {
    return 'bg-red-100 text-red-700';
  }

  if (tone === 'speaking') {
    return 'bg-violet-100 text-violet-700';
  }

  return 'bg-emerald-100 text-emerald-700';
}

const WalkConnectionPills = ({ sensorConnected, coachState, coachMode }) => {
  const coachLabel = coachMode === 'legacy'
    ? (coachState === 'ready' ? 'Legacy' : coachState)
    : coachState;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${pillClass(sensorConnected)}`}>
        Sensor {sensorConnected ? 'On' : 'Off'}
      </span>
      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${pillClass(coachState !== 'error' && coachState !== 'closed' && coachState !== 'idle', coachState === 'speaking' ? 'speaking' : 'neutral')}`}>
        Coach {coachLabel}
      </span>
    </div>
  );
};

export default WalkConnectionPills;
