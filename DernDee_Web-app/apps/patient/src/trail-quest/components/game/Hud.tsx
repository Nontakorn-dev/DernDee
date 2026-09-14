import type { HudSnapshot } from "@trail/lib/game/types";
import { getChapter } from "@trail/lib/progression";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export function GameHud({ hud }: { hud: HudSnapshot }) {
  const chapter = getChapter(hud.chapter);
  const showTip = hud.phase === "waiting" || hud.phase === "charging" || hud.phase === "tired";
  const ratio = Math.min(1, hud.angle / Math.max(1, hud.targetAngle));
  const progressPct = Math.round(hud.progress * 100);
  const jumpNow = hud.hazardKind === "jump";
  const boostNow = hud.hazardKind === "boost";
  const metricLabel =
    hud.chapter === "combined"
      ? jumpNow
        ? "พลังกระโดด"
        : boostNow
          ? "พลังพุ่ง"
          : "พลังก้ม"
      : chapter.metricLabel;
  const metricEn = "Power";
  const tipLines: [string, string] =
    hud.chapter === "combined"
      ? jumpNow
        ? ["ยกเข่าขึ้น ค้างไว้", "ข้ามเหวให้พ้น"]
        : boostNow
          ? ["กดปลายเท้าลง ค้างไว้", "เติมพลังแล้วพุ่งต่อ"]
          : ["กระดกข้อเท้าขึ้น ค้างไว้", "หลบนกที่บินผ่าน"]
      : chapter.tipLines;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="flex h-full flex-col landscape:hidden">
        <div className="flex items-start justify-between px-4 pt-4">
          <div className="text-[2.4rem] font-black leading-none tracking-tight text-slate-800">
            {formatTime(hud.elapsed)}
          </div>
          <ScorePill score={hud.score} />
        </div>
        <div className="mt-2 px-8">
          <div className="h-[6px] overflow-hidden rounded-full bg-white/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7ed957] to-[#5ec8e8]"
              style={{ width: `${Math.max(8, hud.progress * 100)}%` }}
            />
          </div>
        </div>
        <div className="mt-auto flex flex-col items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {showTip ? (
            <>
              <div className="w-full max-w-md">
                <TipCard title={chapter.tipTitle} lines={tipLines} />
              </div>
              <div className="flex w-full max-w-md items-center gap-3">
                <div className="text-[22px] font-black tabular-nums text-emerald-600">
                  {Math.round(hud.angle)}°
                </div>
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-emerald-50/90">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
                    style={{ width: `${Math.max(0, ratio * 100)}%` }}
                  />
                </div>
                <div className="text-[13px] font-bold text-slate-500">{hud.targetAngle}°</div>
              </div>
            </>
          ) : (
            <>
              <PhasePill hud={hud} />
              <div className="grid w-full max-w-md grid-cols-3 gap-2">
                <MetricCard
                  label={metricEn}
                  value={`${Math.round(hud.angle)}°`}
                  hint={metricLabel}
                />
                <MetricCard label="เต็ม" value={`${hud.targetAngle}°`} hint="Goal" />
                <MetricCard
                  label={hud.hazardLabel}
                  value={`${hud.jumpsDone}`}
                  hint={`/${hud.jumpsTotal}`}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="hidden h-full flex-col p-4 xl:p-5 landscape:flex">
        <div className="grid grid-cols-2 items-stretch gap-4 xl:gap-5">
          <div className="flex items-center gap-4 rounded-2xl bg-white/90 px-5 py-4 shadow-lg">
            <div className="min-w-0 flex-1">
              <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
                  style={{ width: `${Math.max(6, Math.min(100, progressPct))}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-sm font-bold text-gray-400">
                <span>ด่าน {hud.stage}</span>
                <span>{progressPct}%</span>
              </div>
            </div>
            <ScorePill score={hud.score} />
          </div>

          {showTip ? (
            <ChargeTube
              label={metricLabel}
              angle={hud.angle}
              target={hud.targetAngle}
              ratio={ratio}
            />
          ) : (
            <div className="grid grid-cols-3 gap-2 xl:gap-3">
              <MetricSquare
                label={metricEn}
                value={`${Math.round(hud.angle)}°`}
                hint={metricLabel}
              />
              <MetricSquare label="เต็ม" value={`${hud.targetAngle}°`} hint="Goal" />
              <MetricSquare
                label={hud.hazardLabel}
                value={`${hud.jumpsDone}`}
                hint={`/${hud.jumpsTotal}`}
              />
            </div>
          )}
        </div>

        <div className="mt-auto flex justify-center">
          {showTip ? (
            <div className="w-full max-w-md">
                <TipCard title={chapter.tipTitle} lines={tipLines} />
            </div>
          ) : (
            <PhasePill hud={hud} />
          )}
        </div>
      </div>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 shadow-lg">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 2.6l2.6 6.4 6.9.6-5.2 4.6 1.6 6.7L12 17.8 6.1 20.9l1.6-6.7L2.5 9.6l6.9-.6L12 2.6z"
          fill="#ffc107"
          stroke="#f5a623"
          strokeWidth="1"
        />
      </svg>
      <span className="text-[18px] font-bold text-slate-700">{score}</span>
    </div>
  );
}

function TipCard({
  title,
  lines,
}: {
  title: string;
  lines: [string, string];
}) {
  return (
    <div className="w-full rounded-[22px] bg-white/95 px-5 py-3 text-center shadow-[0_8px_24px_rgba(70,110,80,0.16)]">
      <div className="text-[15px] font-bold text-emerald-600">{title}</div>
      <p className="mt-0.5 text-[15px] font-semibold leading-snug text-slate-800">
        {lines[0]}
        <br />
        {lines[1]}
      </p>
    </div>
  );
}

function PhasePill({ hud }: { hud: HudSnapshot }) {
  if (hud.phase === "running") {
    const energy = hud.chapter === "plantarflexor";
    return (
      <div className="rounded-full bg-white/90 px-4 py-1.5 text-[13px] font-semibold text-sky-700 shadow-sm">
        {energy ? "พลังเหลือ" : "วิ่งต่อ"} {hud.runRemaining.toFixed(1)} วิ
      </div>
    );
  }
  if (hud.phase === "jumping") {
    return (
      <div className="rounded-full bg-sky-500 px-4 py-1.5 text-[13px] font-extrabold uppercase tracking-wide text-white shadow-sm">
        กระโดด
      </div>
    );
  }
  if (hud.phase === "ducking") {
    return (
      <div className="rounded-full bg-amber-500 px-4 py-1.5 text-[13px] font-extrabold tracking-wide text-white shadow-sm">
        ก้มหลบ
      </div>
    );
  }
  return null;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white/95 p-3 text-center shadow-lg">
      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 text-2xl font-black leading-none tabular-nums text-blue-600">{value}</div>
      <div className="mt-1 text-[11px] font-medium text-gray-400">{hint}</div>
    </div>
  );
}

function ChargeTube({
  label,
  angle,
  target,
  ratio,
}: {
  label: string;
  angle: number;
  target: number;
  ratio: number;
}) {
  return (
    <div className="flex h-full items-center gap-4 rounded-2xl bg-white/95 px-5 py-4 shadow-lg">
      <div className="shrink-0 text-center">
        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
        <div className="text-[1.85rem] font-black leading-none tabular-nums text-emerald-600">
          {Math.round(angle)}°
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="h-4 overflow-hidden rounded-full bg-emerald-50">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
            style={{ width: `${Math.max(0, ratio * 100)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] font-bold text-gray-400">
          <span>ค้างไว้</span>
          <span>เต็ม {target}°</span>
        </div>
      </div>
    </div>
  );
}

function MetricSquare({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-white/95 px-2 py-2 text-center shadow-lg">
      <div className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 text-xl font-black leading-none tabular-nums text-blue-600">{value}</div>
      <div className="mt-0.5 text-[10px] font-medium text-gray-400">{hint}</div>
    </div>
  );
}
