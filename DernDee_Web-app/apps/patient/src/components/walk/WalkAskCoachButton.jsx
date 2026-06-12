import React from 'react';
import { Mic } from 'lucide-react';

const WalkAskCoachButton = ({ active, disabled, onPressStart, onPressEnd }) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={onPressStart}
      onMouseUp={onPressEnd}
      onMouseLeave={onPressEnd}
      onTouchStart={(event) => {
        event.preventDefault();
        onPressStart();
      }}
      onTouchEnd={(event) => {
        event.preventDefault();
        onPressEnd();
      }}
      className={`w-full py-4 rounded-2xl shadow-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
        active
          ? 'bg-violet-600 text-white scale-[0.98]'
          : 'bg-white text-violet-700 border-2 border-violet-200 hover:bg-violet-50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <Mic className="w-5 h-5" />
      {active ? 'กำลังฟัง...' : 'กดค้างเพื่อถามโค้ช'}
    </button>
  );
};

export default WalkAskCoachButton;
