import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

export function SensorPlacementFigures({ images = [], title }) {
  if (!images.length) {
    return null;
  }

  if (images.length > 1) {
    return (
      <div className="flex flex-col gap-3">
        {images.map((image, index) => (
          <article
            key={image.src}
            className="overflow-hidden rounded-[1.5rem] bg-[#e8f4fb] ring-1 ring-sky-100"
          >
            <div className="flex items-baseline gap-2 px-4 pt-3">
              <span className="text-sm font-bold text-sky-600">เกมที่ {index + 1}</span>
              {image.label ? (
                <p className="text-[15px] font-extrabold text-slate-800">{image.label}</p>
              ) : null}
            </div>
            <img
              src={image.src}
              alt={image.label || title}
              width={1408}
              height={1408}
              className="mx-auto max-h-[min(40vh,300px)] w-full object-contain"
            />
          </article>
        ))}
      </div>
    );
  }

  const image = images[0];
  return (
    <figure className="overflow-hidden rounded-[1.6rem] bg-[#e8f4fb]">
      <img
        src={image.src}
        alt={image.label || title}
        width={1408}
        height={1408}
        className="mx-auto max-h-[min(56vh,420px)] w-full object-contain"
      />
    </figure>
  );
}

const SensorPlacementSheet = ({
  open,
  title,
  note,
  images = [],
  connectLabel = 'ไปเชื่อมเซนเซอร์',
  onConnect,
  onClose,
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="ปิด"
        onClick={onClose}
      />

      <div
        className="relative z-10 flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden overscroll-contain rounded-t-[1.85rem] bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.18)] sm:rounded-[2rem] sm:shadow-2xl"
        style={{
          fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif",
          animation: 'sd-sheet-in 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <style>
          {`@keyframes sd-sheet-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}
        </style>
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <div className="h-1.5 w-11 rounded-full bg-slate-200" />
        </div>

        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-1 pt-1 sm:px-6 sm:pt-4">
          <h2
            id={titleId}
            className="min-w-0 text-xl font-black leading-tight tracking-tight text-slate-800 sm:text-[1.45rem]"
          >
            {title}
          </h2>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              aria-label="ปิด"
            >
              <X className="h-5 w-5" strokeWidth={2.4} />
            </button>
          ) : null}
        </header>

        <div className="min-h-0 shrink overflow-y-auto px-5 py-2 sm:px-6 sm:py-3">
          <SensorPlacementFigures images={images} title={title} />
          {note ? (
            <p className="mt-3 text-center text-[15px] leading-relaxed text-slate-500">
              {note}
            </p>
          ) : null}
        </div>

        <footer
          className="shrink-0 bg-white px-5 pt-3 sm:px-6 sm:pt-4"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={onConnect}
            className="min-h-12 w-full rounded-2xl bg-sky-600 py-3 text-base font-extrabold text-white shadow-lg shadow-sky-600/25 hover:bg-sky-700"
          >
            {connectLabel}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default SensorPlacementSheet;
