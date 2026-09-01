import { Link } from "react-router-dom";

export function SensorGate({
  title,
  body,
  missing,
  status,
  error,
  onCalibrate,
  blockedHref = "/map",
  blockedCta = "กลับไปเลือกเกม",
}: {
  title: string;
  body: string;
  missing: string;
  status: "missing" | "calibrate" | "live" | "blocked";
  error?: string;
  onCalibrate: () => void;
  blockedHref?: string;
  blockedCta?: string;
}) {
  if (status === "live") return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/45 p-4"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="text-sm font-semibold text-emerald-600">เซนเซอร์จริง</div>
        <h2 className="mt-1 text-xl font-extrabold text-gray-800">{title}</h2>
        {status === "blocked" ? (
          <>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{body}</p>
            <p className="mt-3 text-sm font-semibold text-amber-600">{missing}</p>
            <Link
              to={blockedHref}
              className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-base font-bold text-white hover:bg-blue-700"
            >
              {blockedCta}
            </Link>
          </>
        ) : status === "missing" ? (
          <>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{body}</p>
            <p className="mt-3 text-sm font-semibold text-amber-600">{missing}</p>
            <Link
              to="/device-connection"
              className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-base font-bold text-white hover:bg-blue-700"
            >
              ไปเชื่อมเซนเซอร์
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
              ยืนตรง วางเท้าบนพื้น อย่ากระดกข้อเท้าหรือยกเข่า แล้วกดตั้งศูนย์
            </p>
            {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
            <button
              type="button"
              className="mt-5 min-h-12 w-full rounded-xl bg-emerald-500 py-3 text-base font-bold text-white hover:bg-emerald-600"
              onClick={onCalibrate}
            >
              ตั้งศูนย์แล้วเล่น
            </button>
          </>
        )}
      </div>
    </div>
  );
}
