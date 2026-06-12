import React from 'react';

const WalkCoachPanel = ({ subtitle, coachState, muted }) => {
  const isSpeaking = coachState === 'speaking';

  return (
    <div className="bg-white rounded-3xl shadow-xl p-5 min-h-[180px] flex flex-col items-center justify-center text-center relative overflow-hidden">
      <div className={`absolute inset-0 opacity-30 ${isSpeaking ? 'animate-pulse bg-gradient-to-br from-violet-200 to-blue-200' : 'bg-gradient-to-br from-blue-50 to-emerald-50'}`} />
      <div className="relative z-10 w-full">
        <div className={`mx-auto mb-4 h-16 w-16 rounded-full border-4 ${isSpeaking ? 'border-violet-400 scale-110' : 'border-blue-300'} transition-transform bg-white flex items-center justify-center`}>
          <div className={`h-8 w-8 rounded-full ${isSpeaking ? 'bg-violet-500' : 'bg-blue-500'}`} />
        </div>
        <p className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-2">
          {muted ? 'Coach muted' : isSpeaking ? 'Coach speaking' : 'Coach ready'}
        </p>
        <p className="text-base sm:text-lg font-semibold text-gray-800 min-h-[3rem] px-2">
          {subtitle || 'เดินได้ตามจังหวะของคุณ โค้ชจะแนะนำเมื่อเหมาะสม'}
        </p>
      </div>
    </div>
  );
};

export default WalkCoachPanel;
