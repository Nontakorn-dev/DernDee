import React, { useId } from 'react';
import { PersonStanding } from 'lucide-react';

const RING_R = 58;
const RING_C = 2 * Math.PI * RING_R;

export default function StandStillCalibrateSheet({
  open,
  secondsLeft,
  totalSeconds = 3,
  waiting = false,
  error = '',
  onRetry,
  title = 'ยืนตรง 3 วินาที',
  body = 'วางเท้าบนพื้น อย่าแกว่งขา',
  holdText = 'ยืนนิ่งไว้',
  waitingText = 'รอสัญญาณเซนเซอร์',
  retryLabel = 'ยืนนิ่งแล้วลองอีกครั้ง',
}) {
  const titleId = useId();
  const ringId = `sd-cal-ring-${titleId.replace(/:/g, '')}`;
  const remaining = Number.isFinite(secondsLeft) ? Math.max(0, secondsLeft) : totalSeconds;
  const fraction = waiting || error ? 1 : Math.max(0, Math.min(1, remaining / totalSeconds));
  const dashOffset = RING_C * (1 - fraction);
  const displayValue = waiting ? '…' : Math.max(remaining, 1);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[3px]" />

      <div
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-t-[1.85rem] bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.22)] sm:rounded-[2rem] sm:shadow-2xl"
        style={{
          fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif",
          animation: 'sd-sheet-in 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <style>
          {`
            @keyframes sd-sheet-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes sd-count-pop { from { transform: scale(0.86); opacity: 0.55; } to { transform: scale(1); opacity: 1; } }
            @keyframes sd-wait-spin { to { transform: rotate(360deg); } }
          `}
        </style>

        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <div className="h-1.5 w-11 rounded-full bg-slate-200" />
        </div>

        <div className="relative overflow-hidden px-6 pb-2 pt-3 text-center sm:px-8 sm:pt-6">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,#e0f2fe_0%,transparent_72%)]"
            aria-hidden
          />

          <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-sky-600 shadow-inner shadow-sky-200/80">
            <PersonStanding className="h-7 w-7" strokeWidth={2.4} />
          </div>

          <p className="relative inline-flex rounded-full bg-sky-50 px-3 py-1 text-sm font-bold text-sky-600">
            ตั้งศูนย์
          </p>
          <h2
            id={titleId}
            className="relative mt-2 text-[1.65rem] font-black leading-tight tracking-tight text-slate-800 sm:text-[1.85rem]"
          >
            {title}
          </h2>
          <p className="relative mx-auto mt-2 max-w-[18rem] text-[15px] leading-relaxed text-slate-500">
            {body}
          </p>
        </div>

        <div className="flex flex-col items-center px-6 pb-2 sm:px-8">
          <div className="relative h-[9.5rem] w-[9.5rem]">
            <svg
              viewBox="0 0 140 140"
              className={`h-full w-full -rotate-90 ${waiting ? '[animation:sd-wait-spin_4s_linear_infinite]' : ''}`}
              aria-hidden
            >
              <defs>
                <linearGradient id={ringId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
              <circle
                cx="70"
                cy="70"
                r={RING_R}
                fill="none"
                stroke="#e0f2fe"
                strokeWidth="10"
              />
              <circle
                cx="70"
                cy="70"
                r={RING_R}
                fill="none"
                stroke={`url(#${ringId})`}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={waiting ? RING_C * 0.78 : dashOffset}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
            </svg>
            <div
              key={displayValue}
              className="absolute inset-0 flex items-center justify-center [animation:sd-count-pop_0.28s_cubic-bezier(0.22,1,0.36,1)]"
              aria-live="polite"
            >
              <span className="text-[3.4rem] font-black tabular-nums leading-none text-sky-600">
                {displayValue}
              </span>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-2" aria-hidden>
            {Array.from({ length: totalSeconds }, (_, index) => {
              const lit = !waiting && !error && index < remaining;
              return (
                <span
                  key={index}
                  className={`h-2 rounded-full transition-all duration-500 ${
                    lit ? 'w-6 bg-sky-500' : 'w-2 bg-sky-100'
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div
          className="px-6 pt-4 sm:px-8"
          style={{ paddingBottom: 'max(1.35rem, env(safe-area-inset-bottom))' }}
        >
          {error ? (
            <>
              <p className="mb-3 text-center text-sm font-semibold text-red-600">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="min-h-12 w-full rounded-2xl bg-sky-600 py-3 text-base font-extrabold text-white shadow-lg shadow-sky-600/25 hover:bg-sky-700"
              >
                {retryLabel}
              </button>
            </>
          ) : (
            <p className="pb-1 text-center text-sm font-semibold text-slate-400">
              {waiting ? waitingText : holdText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
