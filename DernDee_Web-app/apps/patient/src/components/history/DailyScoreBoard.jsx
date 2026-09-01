import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Star, Trophy } from "lucide-react";
import {
  buildDailyScoreboard,
  formatThaiShortDate,
  weekdayShortTh,
} from "@trail/lib/dailyScoreboard";

export function DailyScoreBoard({ days }) {
  const navigate = useNavigate();
  const board = useMemo(() => buildDailyScoreboard(days || []), [days]);
  const [barsReady, setBarsReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setBarsReady(true));
    return () => cancelAnimationFrame(frame);
  }, [board.today]);

  const maxScore = Math.max(...board.week.map((day) => day.score), 1);
  const vsLabel =
    board.delta > 0 ? `+${board.delta}` : board.delta < 0 ? `${board.delta}` : "เท่ากัน";
  const vsColor =
    board.delta > 0 ? "text-emerald-600" : board.delta < 0 ? "text-sky-600" : "text-slate-400";

  return (
    <section
      className="mb-5 rounded-[28px] border-2 border-sky-200 bg-sky-50 p-5 shadow-[0_8px_28px_rgba(14,165,233,0.10)] sm:p-6"
      aria-label="แต้มรายวัน Trail Quest"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-500">Trail Quest</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-800 sm:text-2xl">
            แต้มรายวัน
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">เอาชนะตัวเองของเมื่อวาน</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm">
          <Star className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-sky-100 bg-white p-3 sm:p-4">
          <p className="text-xs font-semibold text-slate-500">วันนี้</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums leading-none text-sky-950 sm:text-4xl">
            {board.todayScore}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-white p-3 sm:p-4">
          <p className="text-xs font-semibold text-slate-500">เมื่อวาน</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums leading-none text-slate-800 sm:text-4xl">
            {board.yesterdayScore}
          </p>
          <p className={`mt-1 text-sm font-bold tabular-nums ${vsColor}`}>{vsLabel}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-sky-100 bg-white px-3 py-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
            <Flame className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">ต่อเนื่อง</p>
            <p className="text-sm font-bold tabular-nums text-slate-800">
              {board.streak} วัน
              {!board.todayPlayed && board.streak > 0 ? (
                <span className="mt-0.5 block text-xs font-semibold text-sky-600">เล่นวันนี้เพื่อต่อ</span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-sky-100 bg-white px-3 py-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">สถิติสูงสุด</p>
            <p className="text-sm font-bold tabular-nums text-slate-800">{board.personalBest} แต้ม</p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-sky-100 bg-white p-4">
        <p className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>7 วันล่าสุด</span>
          <span className="font-medium text-slate-400">ฟ้าเข้ม = วันนี้ · ฟ้าอ่อน = เมื่อวาน</span>
        </p>
        <div className="flex h-36 items-end gap-2" role="img" aria-label="กราฟแต้ม 7 วัน">
          {board.week.map((day) => {
            const isToday = day.date === board.today;
            const isYesterday = day.date === board.week[board.week.length - 2]?.date;
            const pct = Math.max((day.score / maxScore) * 100, day.score > 0 ? 10 : 4);
            return (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="h-4 text-[10px] font-bold tabular-nums text-slate-500">
                  {day.score > 0 ? day.score : ""}
                </span>
                <div className="flex h-24 w-full items-end justify-center">
                  <div
                    className={`w-full max-w-[28px] rounded-t-lg transition-[height] duration-700 ease-out ${
                      isToday ? "bg-blue-500" : isYesterday ? "bg-sky-300" : "bg-sky-100"
                    }`}
                    style={{ height: barsReady ? `${pct}%` : "4%" }}
                    title={`${formatThaiShortDate(day.date)} · ${day.score} แต้ม`}
                  />
                </div>
                <span className={`text-[11px] font-bold ${isToday ? "text-blue-600" : "text-slate-400"}`}>
                  {isToday ? "วันนี้" : weekdayShortTh(day.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="mt-2 divide-y divide-sky-100">
        {[...board.recent]
          .reverse()
          .filter((day) => day.score > 0 || day.date === board.today)
          .map((day, index, list) => {
            const previous = list[index + 1];
            const beat = previous ? day.score - previous.score : 0;
            const isToday = day.date === board.today;
            return (
              <li key={day.date} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className={`text-sm font-bold ${isToday ? "text-blue-600" : "text-slate-800"}`}>
                    {isToday ? "วันนี้" : formatThaiShortDate(day.date)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {day.completedCount > 0 ? `ผ่าน ${day.completedCount} ด่าน` : "ยังไม่เล่น"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums text-slate-800">{day.score}</p>
                  {previous && (day.score > 0 || previous.score > 0) ? (
                    <p
                      className={`text-[11px] font-bold ${
                        beat > 0 ? "text-emerald-600" : beat < 0 ? "text-sky-600" : "text-slate-400"
                      }`}
                    >
                      {beat > 0 ? `แซงครั้งก่อน +${beat}` : beat < 0 ? `ต่ำกว่าครั้งก่อน ${beat}` : "เท่าครั้งก่อน"}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
      </ul>

      <button
        type="button"
        onClick={() => navigate("/map")}
        className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-xl hover:bg-blue-700"
      >
        ไปเก็บแต้มวันนี้
      </button>
    </section>
  );
}
