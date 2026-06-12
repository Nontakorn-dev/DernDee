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
      className={`py-4 rounded-2xl shadow-xl font-bold flex flex-col items-center justify-center gap-1 transition-all touch-none select-none ${
        active
          ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-300'
          : 'bg-white text-violet-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <Mic className="w-6 h-6" />
      <span className="text-xs">{active ? 'Listening' : 'Ask'}</span>
    </button>
  );
};

export default WalkMicButton;
