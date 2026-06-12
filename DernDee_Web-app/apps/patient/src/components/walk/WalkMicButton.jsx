import React from 'react';
import { Mic } from 'lucide-react';

const WalkMicButton = ({ active, disabled, onPressStart, onPressEnd }) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(event) => {
        event.preventDefault();
        onPressStart?.();
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        onPressEnd?.();
      }}
      onPointerCancel={onPressEnd}
      onPointerLeave={onPressEnd}
      className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border font-bold transition-all touch-none select-none sm:min-h-[5rem] sm:rounded-3xl ${
        active
          ? 'border-violet-300 bg-violet-500 text-white shadow-lg shadow-violet-500/30 ring-2 ring-violet-200'
          : 'border-white/70 bg-white/90 text-violet-700 shadow-lg shadow-blue-900/5 hover:bg-white'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.97]'}`}
    >
      <Mic className="h-6 w-6 sm:h-7 sm:w-7" />
      <span className="text-xs font-extrabold uppercase tracking-wide sm:text-sm">
        {active ? 'Listening' : 'Ask'}
      </span>
    </button>
  );
};

export default WalkMicButton;
