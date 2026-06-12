import React from 'react';
import { COACH_CONNECTION_STATES } from '@shared/coach/geminiLiveClient.js';

function coachPillClass(coachState) {
  if (coachState === COACH_CONNECTION_STATES.SPEAKING) {
    return 'bg-emerald-500 text-white';
  }

  if (
    coachState === COACH_CONNECTION_STATES.ERROR
    || coachState === COACH_CONNECTION_STATES.CLOSED
  ) {
    return 'bg-red-500 text-white';
  }

  if (
    coachState === COACH_CONNECTION_STATES.CONNECTING
    || coachState === COACH_CONNECTION_STATES.IDLE
  ) {
    return 'bg-amber-400 text-white';
  }

  return 'bg-emerald-500 text-white';
}

function coachPillLabel(coachState, coachMode) {
  if (coachMode === 'legacy') {
    return 'Coach Legacy';
  }

  if (coachState === COACH_CONNECTION_STATES.SPEAKING) {
    return 'Coach Speaking';
  }

  if (coachState === COACH_CONNECTION_STATES.CONNECTING) {
    return 'Coach Connecting';
  }

  if (coachState === COACH_CONNECTION_STATES.ERROR) {
    return 'Coach Error';
  }

  return 'Coach Ready';
}

const WalkConnectionPills = ({ coachState, coachMode }) => {
  return (
    <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${coachPillClass(coachState)}`}>
      {coachPillLabel(coachState, coachMode)}
    </span>
  );
};

export default WalkConnectionPills;
