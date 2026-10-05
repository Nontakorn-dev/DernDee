import stepdeeLogo from "@shared/assets/images/stepdee-logo.png";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function ClinicalFrame({
  backHref,
  children,
}: {
  backHref: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-gradient-to-b from-[#f5fbff] via-[#e7f4fb] to-[#d5ebf8] text-[#243044]"
      style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
    >
      <header className="flex items-center justify-between bg-white/95 px-4 py-3 shadow-[0_1px_0_rgba(180,205,220,0.7)] md:px-8 lg:px-12">
        <img src={stepdeeLogo} alt="StepDee" className="h-8 w-auto object-contain md:h-10" />
        <Link
          to={backHref}
          aria-label="กลับ"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef6fb] text-[#5b7386] md:h-12 md:w-12"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 6 9 12l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 md:max-w-3xl md:px-8 lg:max-w-5xl lg:px-10">
        {children}
      </div>
    </div>
  );
}

export function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

export function gaugeCeiling(targetAngle: number) {
  return Math.max(20, Math.ceil((targetAngle * 1.35) / 5) * 5);
}
