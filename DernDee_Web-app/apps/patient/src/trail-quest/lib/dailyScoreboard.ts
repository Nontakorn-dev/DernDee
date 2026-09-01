import { bangkokToday } from "@trail/lib/progression";

export type DayScore = {
  date: string;
  score: number;
  completedCount: number;
};

export type DailyScoreRow = {
  playDate: string;
  score: number;
  completedCount?: number;
};

export type DailyChallenge = {
  kind: "win" | "behind" | "tie" | "goal" | "start";
  text: string;
};

export function shiftIsoDate(iso: string, deltaDays: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return next.toISOString().slice(0, 10);
}

export function weekdayShortTh(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function formatThaiShortDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${TH_MONTHS[month - 1]}`;
}

function fillRange(byDate: Map<string, DailyScoreRow>, today: string, days: number): DayScore[] {
  const series: DayScore[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = shiftIsoDate(today, -i);
    const row = byDate.get(date);
    series.push({
      date,
      score: row?.score ?? 0,
      completedCount: row?.completedCount ?? 0,
    });
  }
  return series;
}

export function buildDailyScoreboard(rows: DailyScoreRow[], today = bangkokToday()) {
  const byDate = new Map(rows.map((row) => [row.playDate, row]));
  const week = fillRange(byDate, today, 7);
  const recent = fillRange(byDate, today, 14);
  const todayScore = week[week.length - 1]?.score ?? 0;
  const yesterdayScore = week[week.length - 2]?.score ?? 0;
  const delta = todayScore - yesterdayScore;

  const start = todayScore > 0 ? 0 : 1;
  let streak = 0;
  for (let i = start; i < 400; i += 1) {
    const score = byDate.get(shiftIsoDate(today, -i))?.score ?? 0;
    if (score > 0) streak += 1;
    else break;
  }

  const personalBest = rows.reduce((best, row) => Math.max(best, row.score || 0), 0);

  let challenge: DailyChallenge;
  if (todayScore === 0 && yesterdayScore > 0) {
    challenge = { kind: "goal", text: `เป้าวันนี้ ${yesterdayScore} แต้ม` };
  } else if (todayScore === 0 && yesterdayScore === 0) {
    challenge = { kind: "start", text: "เล่นวันนี้เพื่อตั้งแต้มแรก" };
  } else if (yesterdayScore === 0 && todayScore > 0) {
    challenge = { kind: "start", text: "ตั้งต้นวันนี้แล้ว พรุ่งนี้มาแซง" };
  } else if (todayScore > yesterdayScore) {
    challenge = { kind: "win", text: `แซงเมื่อวานแล้ว +${delta}` };
  } else if (todayScore === yesterdayScore) {
    challenge = { kind: "tie", text: "เท่าเมื่อวาน — อีกนิดแซงได้" };
  } else {
    challenge = { kind: "behind", text: `อีก ${yesterdayScore - todayScore} แต้มจะแซงเมื่อวาน` };
  }

  return {
    today,
    week,
    recent,
    todayScore,
    yesterdayScore,
    delta,
    streak,
    personalBest,
    challenge,
    todayPlayed: todayScore > 0,
  };
}
