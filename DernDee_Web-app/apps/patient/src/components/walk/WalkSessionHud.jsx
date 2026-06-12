import React from 'react';

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const WalkSessionHud = ({ timeElapsed, targetSeconds }) => {
  const progress = Math.min((timeElapsed / targetSeconds) * 100, 100);

  return (
    <div className="rounded-2xl border border-white/60 bg-white/75 px-4 py-3 shadow-lg shadow-blue-900/5 backdrop-blur-md sm:px-6 sm:py-4">
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500/80 sm:text-xs">
            Session Time
          </p>
          <p className="text-3xl font-black tabular-nums text-blue-950 sm:text-4xl lg:text-5xl">
            {formatTime(timeElapsed)}
            <span className="text-lg font-bold text-blue-400 sm:text-xl lg:text-2xl">
              {' '}/ {formatTime(targetSeconds)}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500/80 sm:text-xs">
            Progress
          </p>
          <p className="text-xl font-black tabular-nums text-blue-700 sm:text-2xl">
            {Math.round(progress)}%
          </p>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-blue-100/80 sm:h-3.5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 shadow-[0_0_12px_rgba(59,130,246,0.45)] transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default WalkSessionHud;
