import React from 'react';
import { Pause } from 'lucide-react';

const WalkPauseDialog = ({
  open,
  ending = false,
  onContinue,
  onStop,
}) => {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walk-pause-title"
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[3px]" />
      <div
        className="relative z-10 w-full max-w-md rounded-t-[1.85rem] bg-white px-6 pb-8 pt-5 shadow-[0_-18px_50px_rgba(15,23,42,0.22)] sm:rounded-[2rem] sm:p-8 sm:shadow-2xl"
        style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
      >
        <div className="flex justify-center sm:hidden" aria-hidden>
          <div className="mb-3 h-1.5 w-11 rounded-full bg-slate-200" />
        </div>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Pause className="h-7 w-7" strokeWidth={2.4} />
        </div>
        <h2
          id="walk-pause-title"
          className="text-center text-[1.65rem] font-black leading-tight tracking-tight text-slate-800 sm:text-[1.85rem]"
        >
          พักการเดิน
        </h2>
        <p className="mx-auto mt-2 max-w-[18rem] text-center text-[15px] leading-relaxed text-slate-500">
          ต้องการหยุดการเดินตอนนี้ หรือเดินต่อ?
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={ending}
            onClick={onContinue}
            className="rounded-2xl bg-emerald-500 py-4 text-base font-extrabold text-white shadow-xl transition hover:bg-emerald-600 hover:scale-[1.02] disabled:opacity-60"
          >
            เดินต่อ
          </button>
          <button
            type="button"
            disabled={ending}
            onClick={onStop}
            className="rounded-2xl bg-red-500 py-4 text-base font-extrabold text-white shadow-xl transition hover:bg-red-600 hover:scale-[1.02] disabled:opacity-60"
          >
            {ending ? 'กำลังหยุด…' : 'หยุด'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WalkPauseDialog;
