import { getSupabaseClient, isSupabaseConfigured } from "@shared/supabase/client.js";
import type { MovementKind, SaveState, StageClearRecord } from "@trail/lib/progression";

type TrailQuestDayRow = {
  play_date: string;
  completed: string[] | null;
  score: number | null;
  last_chapter: string | null;
  last_stage: number | null;
  clears: unknown;
};

const CHAPTER_IDS = new Set(["dorsiflexor", "plantarflexor", "hip-flexor", "combined"]);

function isMovementKind(value: unknown): value is MovementKind {
  return typeof value === "string" && CHAPTER_IDS.has(value);
}

function parseClears(raw: unknown): StageClearRecord[] {
  if (!Array.isArray(raw)) return [];
  const clears: StageClearRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (!isMovementKind(record.chapter) || typeof record.stage !== "number") continue;
    clears.push({
      chapter: record.chapter,
      stage: record.stage,
      earned: typeof record.earned === "number" ? record.earned : 0,
      clearedAt: typeof record.clearedAt === "string" ? record.clearedAt : new Date().toISOString(),
    });
  }
  return clears;
}

export function rowToSave(row: TrailQuestDayRow, fallbackDate: string): SaveState {
  const lastChapter = isMovementKind(row.last_chapter) ? row.last_chapter : null;
  const lastStage = typeof row.last_stage === "number" ? row.last_stage : null;
  return {
    playDate: row.play_date || fallbackDate,
    totalScore: row.score ?? 0,
    completed: Array.isArray(row.completed) ? row.completed : [],
    lastPlayed: lastChapter && lastStage ? { chapter: lastChapter, stage: lastStage } : null,
    clears: parseClears(row.clears),
  };
}

async function getPatientId() {
  if (!isSupabaseConfigured) return null;
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function fetchTrailQuestDay(playDate: string): Promise<SaveState | null> {
  const patientId = await getPatientId();
  if (!patientId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("trail_quest_days")
    .select("play_date, completed, score, last_chapter, last_stage, clears")
    .eq("patient_id", patientId)
    .eq("play_date", playDate)
    .maybeSingle();
  if (error || !data) return null;
  return rowToSave(data as TrailQuestDayRow, playDate);
}

export async function persistTrailQuestDay(save: SaveState) {
  const patientId = await getPatientId();
  if (!patientId) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("trail_quest_days").upsert(
    {
      patient_id: patientId,
      play_date: save.playDate,
      completed: save.completed,
      score: save.totalScore,
      last_chapter: save.lastPlayed?.chapter ?? null,
      last_stage: save.lastPlayed?.stage ?? null,
      clears: save.clears,
    },
    { onConflict: "patient_id,play_date" },
  );
  if (error) {
    console.warn("Trail Quest progress sync failed", error.message);
  }
}
