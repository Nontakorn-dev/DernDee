import derndeeLogo from "@shared/assets/images/derndee-logo.png";
import { Link, useNavigate } from "react-router-dom";
import { useRef, type PointerEvent, type ReactNode } from "react";

function isPrimaryPointer(e: PointerEvent) {
  return e.pointerType !== "mouse" || e.button === 0;
}

export function GameHeader({
  backHref,
  homeHref = "/map",
  onNavigate,
  actions,
}: {
  backHref?: string | null;
  homeHref?: string;
  onNavigate?: (href: string) => void;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const go = (href: string) => (e: PointerEvent<HTMLAnchorElement>) => {
    if (!isPrimaryPointer(e)) return;
    e.stopPropagation();
    if (onNavigate) onNavigate(href);
    else navigate(href);
  };

  return (
    <header className="relative z-50 isolate flex shrink-0 items-center justify-between bg-white px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-md sm:px-5 sm:pb-2.5">
      <div className="relative z-50 flex items-center gap-1 sm:gap-3">
        {backHref ? (
          <Link
            to={backHref}
            aria-label="กลับ"
            onPointerDown={go(backHref)}
            className="relative z-50 flex h-12 w-12 cursor-pointer touch-manipulation items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 6 9 12l6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        ) : null}
        <Link
          to={homeHref}
          onPointerDown={go(homeHref)}
          className="relative z-50 flex min-h-12 cursor-pointer touch-manipulation items-center px-1"
        >
          <img
            src={derndeeLogo}
            alt="DernDee"
            className="h-8 w-auto object-contain sm:h-10"
          />
        </Link>
      </div>
      <div className="relative z-50 flex items-center gap-2 sm:gap-3">{actions}</div>
    </header>
  );
}

export function HeaderIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const tapped = useRef(0);
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!isPrimaryPointer(e)) return;
        tapped.current = Date.now();
        onClick?.();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (Date.now() - tapped.current < 500) return;
        onClick?.();
      }}
      className="relative z-50 flex h-12 w-12 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-blue-100 text-blue-600 transition-colors hover:bg-blue-200"
    >
      {children}
    </button>
  );
}
