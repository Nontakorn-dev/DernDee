import type { TrailKit, TrailKitDetection } from "@trail/lib/trailKit";
import { canPlayChapterWithKit } from "@trail/lib/trailKit";

export type MovementKind = "dorsiflexor" | "plantarflexor" | "hip-flexor" | "combined";

export function chapterNeedsJump(chapter: MovementKind, kit: TrailKit = "full") {
  return chapter === "hip-flexor" || (chapter === "combined" && kit === "full");
}

export function isEnergyRun(chapter: MovementKind) {
  return chapter === "plantarflexor";
}

export type StageDef = {
  id: number;
  name: string;
  gaps: number;
  targetAngle: number;
  runSeconds: number;
  story: {
    title: string;
    body: string;
  };
};

export type ChapterDef = {
  id: MovementKind;
  order: number;
  title: string;
  titleEn: string;
  blurb: string;
  metricLabel: string;
  metricEn: string;
  tipTitle: string;
  tipLines: [string, string];
  unlockScore: number;
  unlockHint: string;
  stages: StageDef[];
};

export const CHAPTERS: ChapterDef[] = [
  {
    id: "dorsiflexor",
    order: 1,
    title: "นกบินต่ำ",
    titleEn: "Sky Duck",
    blurb: "ก้มหลบนกที่บินผ่าน แล้วเดินต่อไป",
    metricLabel: "พลัง",
    metricEn: "Power",
    tipTitle: "เคล็ดลับ",
    tipLines: ["กระดกข้อเท้าขึ้น ค้างไว้", "หลบนกที่บินผ่าน"],
    unlockScore: 0,
    unlockHint: "",
    stages: [
      {
        id: 1,
        name: "ทางออกหมู่บ้าน",
        gaps: 5,
        targetAngle: 12,
        runSeconds: 5,
        story: {
          title: "ไดโนน้อยออกเดินทาง",
          body: "หมู่บ้านเงียบเกินไปแล้ว นกบินต่ำขวางทาง — ก้มหลบแล้วเดินต่อไป",
        },
      },
      {
        id: 2,
        name: "ทุ่งใบไม้ทอง",
        gaps: 5,
        targetAngle: 16,
        runSeconds: 5,
        story: {
          title: "ลมบอกทาง",
          body: "ใบไม้สีทองปลิวตามทาง ยิ่งหลบเก่ง ธงเขียวยิ่งใกล้",
        },
      },
      {
        id: 3,
        name: "ฝูงนกหิมะ",
        gaps: 5,
        targetAngle: 20,
        runSeconds: 5,
        story: {
          title: "หลบนกครบแล้ว",
          body: "ฝูงนกสุดท้ายบินผ่านทุ่งขาว ถนนยาวข้างหน้าชวนให้พุ่งต่อ",
        },
      },
    ],
  },
  {
    id: "plantarflexor",
    order: 2,
    title: "พุ่งสุดแรง",
    titleEn: "Boost Dash",
    blurb: "วิ่งให้ไกล เติมพลัง แล้วพุ่งต่อ",
    metricLabel: "พลัง",
    metricEn: "Power",
    tipTitle: "เคล็ดลับ",
    tipLines: ["กดปลายเท้าลง ค้างไว้", "เติมพลังแล้วพุ่งต่อ"],
    unlockScore: 0,
    unlockHint: "ผ่านด่านฝูงนกหิมะของนกบินต่ำก่อน",
    stages: [
      {
        id: 1,
        name: "ถนนไกลบ้าน",
        gaps: 5,
        targetAngle: 12,
        runSeconds: 5,
        story: {
          title: "ทางวิ่งไกล",
          body: "ทางยังอีกยาว วิ่งไปจนเหนื่อย — เติมพลังแล้วพุ่งต่อไป",
        },
      },
      {
        id: 2,
        name: "เนินลมทอง",
        gaps: 5,
        targetAngle: 16,
        runSeconds: 5,
        story: {
          title: "ลมดันหลัง",
          body: "ใบไม้สีทองปลิวตามก้าว ยิ่งพุ่งเก่ง ธงเขียวยิ่งอยู่พ้นเนิน",
        },
      },
      {
        id: 3,
        name: "ลานขาวสุดขอบ",
        gaps: 5,
        targetAngle: 20,
        runSeconds: 5,
        story: {
          title: "พุ่งถึงขอบขาว",
          body: "หิมะทำให้ทางยาว แต่พลังยังพุ่งได้ เหวหินทรายรออยู่ในเกมต่อไป",
        },
      },
    ],
  },
  {
    id: "hip-flexor",
    order: 3,
    title: "ข้ามเหว",
    titleEn: "Cliff Hopper",
    blurb: "กระโดดข้ามเหว ไปให้ถึงธง",
    metricLabel: "พลัง",
    metricEn: "Power",
    tipTitle: "เคล็ดลับ",
    tipLines: ["ยกเข่าขึ้น ค้างไว้", "ข้ามเหวให้พ้น"],
    unlockScore: 0,
    unlockHint: "ผ่านด่านลานขาวสุดขอบของพุ่งสุดแรงก่อน",
    stages: [
      {
        id: 1,
        name: "โขดหินสีชาด",
        gaps: 5,
        targetAngle: 22,
        runSeconds: 5,
        story: {
          title: "ก้าวที่ยาวขึ้น",
          body: "กระโดดพ้นโขดหิน ไดโนน้อยเห็นสะพานไม้ไกลออกไป",
        },
      },
      {
        id: 2,
        name: "สะพานใบไม้",
        gaps: 5,
        targetAngle: 26,
        runSeconds: 5,
        story: {
          title: "ข้ามสะพานลม",
          body: "ลมแรงแต่ก้าวไม่สั่น ใบไม้ร่วงสองข้างทาง ป่าใหญ่รออยู่ข้างหน้า",
        },
      },
      {
        id: 3,
        name: "เหวน้ำแข็ง",
        gaps: 5,
        targetAngle: 30,
        runSeconds: 5,
        story: {
          title: "ก้าวบนน้ำแข็ง",
          body: "เหวขาวกว่าเดิม แต่ยังข้ามได้ ป่าหิมะกำลังรอจังหวะถัดไป",
        },
      },
    ],
  },
  {
    id: "combined",
    order: 4,
    title: "ป่าจังหวะ",
    titleEn: "Wild Trail",
    blurb: "หลบนกใช้ข้อเท้า พุ่งใช้ปลายเท้า ถ้ามีต้นขาด้วยจะข้ามเหวได้ด้วย",
    metricLabel: "พลัง",
    metricEn: "Power",
    tipTitle: "เคล็ดลับ",
    tipLines: ["ทำตามจังหวะที่ขึ้นบนจอ", "เดินให้ถึงธง"],
    unlockScore: 0,
    unlockHint: "ผ่านด่านลานขาวสุดขอบของพุ่งสุดแรงก่อน",
    stages: [
      {
        id: 1,
        name: "ป่าธงเขียว",
        gaps: 5,
        targetAngle: 24,
        runSeconds: 5,
        story: {
          title: "สองจังหวะหนึ่งทาง",
          body: "หลบนก พุ่งแรง หรือข้ามเหว ตามเซนเซอร์ที่ติด ไดโนน้อยกำลังเดินทางจริง ๆ",
        },
      },
      {
        id: 2,
        name: "ป่าสีทอง",
        gaps: 5,
        targetAngle: 28,
        runSeconds: 5,
        story: {
          title: "ก้าวในใบไม้",
          body: "จังหวะสลับกันในทุ่งส้ม ธงยังอยู่ไกล แต่ก้าวเริ่มนิ่ง",
        },
      },
      {
        id: 3,
        name: "เส้นชัยขอบฟ้า",
        gaps: 5,
        targetAngle: 32,
        runSeconds: 5,
        story: {
          title: "ถึงขอบฟ้าแล้ว",
          body: "ธงปักบนเนินหิมะสุดท้าย ทางยังไม่จบ แต่ทุกก้าวเป็นเรื่องของตัวเอง",
        },
      },
    ],
  },
];

export type StageClearRecord = {
  chapter: MovementKind;
  stage: number;
  earned: number;
  clearedAt: string;
};

export type SaveState = {
  playDate: string;
  totalScore: number;
  completed: string[];
  lastPlayed: { chapter: MovementKind; stage: number } | null;
  clears: StageClearRecord[];
};

const SAVE_KEY = "derndee-save-v2";

export function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function emptySave(playDate = bangkokToday()): SaveState {
  return {
    playDate,
    totalScore: 0,
    completed: [],
    lastPlayed: null,
    clears: [],
  };
}

export function stageKey(chapter: MovementKind, stage: number) {
  return `${chapter}-${stage}`;
}

export function getChapter(id: MovementKind) {
  return CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
}

export function getStage(chapter: MovementKind, stageId: number) {
  const ch = getChapter(chapter);
  return ch.stages.find((s) => s.id === stageId) ?? ch.stages[0];
}

function normalizeSave(raw: Partial<SaveState> | null | undefined, playDate: string): SaveState {
  if (!raw || raw.playDate !== playDate) return emptySave(playDate);
  return {
    playDate,
    totalScore: raw.totalScore ?? 0,
    completed: Array.isArray(raw.completed) ? raw.completed : [],
    lastPlayed: raw.lastPlayed ?? null,
    clears: Array.isArray(raw.clears) ? raw.clears : [],
  };
}

function writeLocalSave(next: SaveState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(next));
}

export function loadSave(): SaveState {
  const today = bangkokToday();
  if (typeof window === "undefined") return emptySave(today);
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return emptySave(today);
    return normalizeSave(JSON.parse(raw) as Partial<SaveState>, today);
  } catch {
    return emptySave(today);
  }
}

function savesDiffer(a: SaveState, b: SaveState) {
  return (
    a.totalScore !== b.totalScore ||
    a.completed.length !== b.completed.length ||
    a.completed.join("|") !== b.completed.join("|") ||
    a.clears.length !== b.clears.length
  );
}

export function mergeSaves(a: SaveState, b: SaveState): SaveState {
  const playDate = bangkokToday();
  const completed = [...new Set([...a.completed, ...b.completed])];
  const clearsByKey = new Map<string, StageClearRecord>();
  for (const record of [...a.clears, ...b.clears]) {
    const key = `${record.chapter}-${record.stage}-${record.clearedAt}`;
    if (!clearsByKey.has(key)) clearsByKey.set(key, record);
  }
  const clears = [...clearsByKey.values()];
  const earned = clears.reduce((sum, record) => sum + (record.earned || 0), 0);
  return {
    playDate,
    totalScore: Math.max(a.totalScore, b.totalScore, earned),
    completed,
    lastPlayed: a.lastPlayed ?? b.lastPlayed,
    clears,
  };
}

export function writeSave(next: SaveState) {
  const today = bangkokToday();
  const payload = normalizeSave(next, today);
  writeLocalSave(payload);
  void import("@trail/lib/trailQuestCloud").then(({ persistTrailQuestDay }) => {
    void persistTrailQuestDay(payload);
  });
}

export async function hydrateSave(): Promise<SaveState> {
  const local = loadSave();
  try {
    const { fetchTrailQuestDay, persistTrailQuestDay } = await import("@trail/lib/trailQuestCloud");
    const remote = await fetchTrailQuestDay(local.playDate);
    if (!remote) {
      if (local.completed.length > 0 || local.totalScore > 0) {
        void persistTrailQuestDay(local);
      }
      return local;
    }
    const merged = mergeSaves(local, remote);
    writeLocalSave(merged);
    if (savesDiffer(merged, remote)) {
      void persistTrailQuestDay(merged);
    }
    return merged;
  } catch {
    return local;
  }
}

export function isChapterUnlocked(
  chapter: ChapterDef,
  save: SaveState,
  detection: TrailKitDetection | "unknown" = "unknown",
) {
  if (!canPlayChapterWithKit(chapter.id, detection)) return false;
  if (chapter.id === "dorsiflexor") return true;
  if (chapter.id === "plantarflexor") return save.completed.includes(stageKey("dorsiflexor", 3));
  if (chapter.id === "hip-flexor") {
    if (detection === "knee") return true;
    return save.completed.includes(stageKey("plantarflexor", 3));
  }
  return save.completed.includes(stageKey("plantarflexor", 3));
}

export function chapterLockHint(
  chapter: ChapterDef,
  save: SaveState,
  detection: TrailKitDetection | "unknown" = "unknown",
) {
  if (!canPlayChapterWithKit(chapter.id, detection)) {
    if (chapter.id === "combined") {
      return "ป่าจังหวะต้องมีหน้าแข้ง + หลังเท้า ถ้าติดแค่ต้นขา + หน้าแข้ง ให้เล่นข้ามเหว";
    }
    if (chapter.id === "hip-flexor") {
      return "ข้ามเหวต้องมีต้นขา + หน้าแข้ง ถ้ามีแค่หน้าแข้ง + หลังเท้า ให้เล่นป่าจังหวะ";
    }
    return "เกมนี้ต้องมีหน้าแข้ง + หลังเท้า";
  }
  if (isChapterUnlocked(chapter, save, detection)) return "";
  return chapter.unlockHint;
}

export function isStageUnlocked(
  chapter: ChapterDef,
  stage: StageDef,
  save: SaveState,
  detection: TrailKitDetection | "unknown" = "unknown",
) {
  if (!isChapterUnlocked(chapter, save, detection)) return false;
  if (stage.id === 1) return true;
  return save.completed.includes(stageKey(chapter.id, stage.id - 1));
}

export function applyLiveScore(save: SaveState, totalScore: number): SaveState {
  const today = bangkokToday();
  const base = save.playDate === today ? save : emptySave(today);
  const nextTotal = Math.max(base.totalScore, Math.max(0, Math.floor(totalScore)));
  if (nextTotal === base.totalScore) return base;
  return {
    ...base,
    playDate: today,
    totalScore: nextTotal,
  };
}

export function applyStageClear(
  save: SaveState,
  chapter: MovementKind,
  stage: number,
  earned: number,
  totalScore?: number,
): SaveState {
  const today = bangkokToday();
  const base = save.playDate === today ? save : emptySave(today);
  const key = stageKey(chapter, stage);
  const completed = base.completed.includes(key)
    ? base.completed
    : [...base.completed, key];
  const reportedTotal = typeof totalScore === "number"
    ? totalScore
    : base.totalScore + Math.max(0, earned);
  return {
    playDate: today,
    totalScore: Math.max(base.totalScore, Math.max(0, Math.floor(reportedTotal))),
    completed,
    lastPlayed: { chapter, stage },
    clears: [
      ...base.clears,
      { chapter, stage, earned: Math.max(0, earned), clearedAt: new Date().toISOString() },
    ],
  };
}

export function nextPlayable(
  save: SaveState,
  detection: TrailKitDetection | "unknown" = "unknown",
): { chapter: MovementKind; stage: number } {
  for (const ch of CHAPTERS) {
    if (!isChapterUnlocked(ch, save, detection)) continue;
    for (const st of ch.stages) {
      if (!save.completed.includes(stageKey(ch.id, st.id)) && isStageUnlocked(ch, st, save, detection)) {
        return { chapter: ch.id, stage: st.id };
      }
    }
  }
  if (save.lastPlayed) return save.lastPlayed;
  return { chapter: "dorsiflexor", stage: 1 };
}

export function nextPlayableInChapter(
  chapter: ChapterDef,
  save: SaveState,
  detection: TrailKitDetection | "unknown" = "unknown",
) {
  for (const st of chapter.stages) {
    if (!save.completed.includes(stageKey(chapter.id, st.id)) && isStageUnlocked(chapter, st, save, detection)) {
      return st.id;
    }
  }
  return chapter.stages[0]?.id ?? 1;
}

export function nextDestination(
  chapter: MovementKind,
  stage: number,
  kit: TrailKit | TrailKitDetection | "unknown" = "unknown",
) {
  const ch = getChapter(chapter);
  const idx = ch.stages.findIndex((s) => s.id === stage);
  if (idx >= 0 && idx < ch.stages.length - 1) {
    return { chapter, stage: ch.stages[idx + 1].id, kind: "stage" as const };
  }
  const detection: TrailKitDetection | "unknown" =
    kit === "unknown" || kit === "none" || kit === "knee" || kit === "ankle" || kit === "full"
      ? kit
      : "unknown";
  const nextChapter = CHAPTERS.find((item) => item.order === ch.order + 1);
  if (nextChapter && canPlayChapterWithKit(nextChapter.id, detection)) {
    return { chapter: nextChapter.id, stage: 1, kind: "chapter" as const };
  }
  if (nextChapter) {
    const skipTo = CHAPTERS.find(
      (item) => item.order > nextChapter.order && canPlayChapterWithKit(item.id, detection),
    );
    if (skipTo) {
      return { chapter: skipTo.id, stage: 1, kind: "chapter" as const };
    }
  }
  return { chapter, stage, kind: "complete" as const };
}
