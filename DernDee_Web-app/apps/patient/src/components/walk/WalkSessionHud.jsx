import React from 'react';

export function formatWalkTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function WalkSessionClock({ timeElapsed }) {
  return (
    <div className="walk-session-time">
      <span className="walk-session-time__label">เวลา</span>
      <p>{formatWalkTime(timeElapsed)}</p>
    </div>
  );
}

export function WalkStepCount({ steps = 0 }) {
  return (
    <div className="walk-step-count" aria-live="polite">
      <span className="walk-step-count__value">{Math.max(0, Math.round(steps))}</span>
      <span className="walk-step-count__label">step</span>
    </div>
  );
}
