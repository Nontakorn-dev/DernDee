import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import SensorPlacementSheet from "@patient/components/SensorPlacementSheet.jsx";
import StandStillCalibrateSheet from "@patient/components/StandStillCalibrateSheet.jsx";

export function SensorGate({
  title,
  body,
  missing,
  status,
  error,
  images = [],
  note,
  onCalibrate,
  blockedHref = "/map",
  blockedCta = "กลับไปเลือกเกม",
}: {
  title: string;
  body: string;
  missing: string;
  status: "missing" | "calibrate" | "live" | "blocked";
  error?: string;
  images?: Array<{ src: string; label?: string }>;
  note?: string;
  onCalibrate: () => void;
  blockedHref?: string;
  blockedCta?: string;
}) {
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(3);
  const [awaitingRetry, setAwaitingRetry] = useState(false);
  const onCalibrateRef = useRef(onCalibrate);
  onCalibrateRef.current = onCalibrate;

  useEffect(() => {
    if (status === "calibrate" && error) {
      setAwaitingRetry(true);
    }
  }, [error, status]);

  useEffect(() => {
    if (status !== "calibrate") {
      setSecondsLeft(3);
      setAwaitingRetry(false);
      return undefined;
    }

    if (awaitingRetry) {
      return undefined;
    }

    setSecondsLeft(3);
    const timer = window.setInterval(() => {
      setSecondsLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          onCalibrateRef.current();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [awaitingRetry, status]);

  if (status === "live") return null;

  if (status === "missing") {
    return (
      <SensorPlacementSheet
        open
        title={title}
        note={note}
        images={images}
        onConnect={() => {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          navigate("/device-connection", { state: { returnTo } });
        }}
        onClose={() => navigate(blockedHref)}
      />
    );
  }

  if (status === "blocked") {
    return (
      <div
        className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[3px]" />
        <div
          className="relative z-10 w-full max-w-md rounded-t-[1.85rem] bg-white p-6 text-center shadow-[0_-18px_50px_rgba(15,23,42,0.22)] sm:rounded-[2rem]"
          style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
        >
          <h2 className="text-xl font-black tracking-tight text-slate-800">{title}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{body}</p>
          <p className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
            {missing}
          </p>
          <Link
            to={blockedHref}
            className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-sky-600 py-3 text-base font-extrabold text-white shadow-lg shadow-sky-600/25 hover:bg-sky-700"
          >
            {blockedCta}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <StandStillCalibrateSheet
      open
      body="ยืนตรง วางเท้าบนพื้น อย่ากระดกข้อเท้าหรือยกเข่า"
      secondsLeft={secondsLeft}
      waiting={false}
      error={awaitingRetry ? error : ""}
      onRetry={() => setAwaitingRetry(false)}
      retryLabel="ยืนนิ่งแล้วตั้งศูนย์อีกครั้ง"
    />
  );
}
