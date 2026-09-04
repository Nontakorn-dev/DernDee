import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import SensorPlacementSheet from "@patient/components/SensorPlacementSheet.jsx";

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

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-md rounded-[2rem] bg-white p-6 text-center shadow-2xl"
        style={{ fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-500">
          เซนเซอร์จริง
        </p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-slate-800">{title}</h2>
        {status === "blocked" ? (
          <>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{body}</p>
            <p className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
              {missing}
            </p>
            <Link
              to={blockedHref}
              className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-sky-600 py-3 text-base font-extrabold text-white shadow-lg shadow-sky-600/20 hover:bg-sky-700"
            >
              {blockedCta}
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
              ยืนตรง วางเท้าบนพื้น อย่ากระดกข้อเท้าหรือยกเข่า กำลังตั้งศูนย์ {secondsLeft} วินาที
            </p>
            <div className="mt-4 text-6xl font-black tabular-nums text-emerald-500">
              {Math.max(secondsLeft, 1)}
            </div>
            {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
            {awaitingRetry ? (
              <button
                type="button"
                className="mt-5 min-h-12 w-full rounded-2xl bg-emerald-500 py-3 text-base font-extrabold text-white hover:bg-emerald-600"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setAwaitingRetry(false);
                }}
                onClick={() => setAwaitingRetry(false)}
              >
                ยืนนิ่งแล้วตั้งศูนย์อีกครั้ง
              </button>
            ) : (
              <p className="mt-4 text-sm font-semibold text-slate-400">ยืนนิ่งไว้</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
