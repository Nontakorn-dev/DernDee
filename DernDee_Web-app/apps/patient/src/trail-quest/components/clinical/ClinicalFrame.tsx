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
      className="flex min-h-dvh flex-col bg-gradient-to-b from-blue-50 via-blue-100 to-blue-200 text-gray-800"
      style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
    >
      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-xl sm:px-6 sm:py-4 lg:px-12">
        <div className="flex items-center gap-3">
          <Link
            to={backHref}
            aria-label="กลับ"
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 6 9 12l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <img src={stepdeeLogo} alt="StepDee" className="h-10 object-contain sm:h-12" />
        </div>
        <div className="w-11" />
      </header>
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-12 lg:py-10">
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
