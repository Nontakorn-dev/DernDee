import type { HazardKind } from "@trail/lib/game/types";
import type { MovementKind } from "@trail/lib/progression";
import type { TrailKitDetection } from "@trail/lib/trailKit";

export const TOUCH_INPUT = "touch";

export type JointInput = "dorsiflexion" | "plantarflexion" | "kneeFlexion";

export function isTouchInputParam(params: URLSearchParams) {
  return params.get("input") === TOUCH_INPUT;
}

export function withTouchInput(href: string, allowTouch: boolean) {
  if (!allowTouch) return href;
  const qIndex = href.indexOf("?");
  const pathname = qIndex >= 0 ? href.slice(0, qIndex) : href;
  const search = qIndex >= 0 ? href.slice(qIndex + 1) : "";
  const params = new URLSearchParams(search);
  params.set("input", TOUCH_INPUT);
  const nextSearch = params.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export function jointInputFor(chapter: MovementKind, hazardKind: HazardKind | null): JointInput {
  if (chapter === "plantarflexor" || hazardKind === "boost") return "plantarflexion";
  if (chapter === "hip-flexor" || hazardKind === "jump") return "kneeFlexion";
  if (chapter === "dorsiflexor" || hazardKind === "duck") return "dorsiflexion";
  return "dorsiflexion";
}

export function chapterNeedsAnklePair(chapter: MovementKind) {
  return chapter === "dorsiflexor" || chapter === "plantarflexor" || chapter === "combined";
}

export function chapterNeedsKneePair(chapter: MovementKind) {
  return chapter === "hip-flexor";
}

export function jointLabelFor(input: JointInput) {
  if (input === "plantarflexion") return "มุมข้อเท้า · กดปลายเท้า";
  if (input === "kneeFlexion") return "มุมเข่า · ต้นขา–หน้าแข้ง";
  return "มุมข้อเท้า · กระดกขึ้น";
}

export function sensorRequirementCopy(chapter: MovementKind, detection: TrailKitDetection = "none") {
  if (chapter === "combined" && detection === "knee") {
    return {
      title: "เล่นป่าจังหวะไม่ได้",
      body: "ป่าจังหวะต้องมีหน้าแข้ง + หลังเท้า ถ้าติดแค่ต้นขา + หน้าแข้ง ให้เล่นข้ามเหว",
      missing: "มีแค่คู่เข่า จึงเล่นเกมนี้ไม่ได้",
      blocked: true,
    };
  }
  if (chapter === "hip-flexor") {
    return {
      title: "ใช้เซนเซอร์ต้นขา + หน้าแข้ง",
      body: "เกมนี้วัดมุมเข่าจากต้นขาและหน้าแข้งข้างเดียวกัน ติดเซนเซอร์ที่ต้นขากับหน้าแข้ง แล้วยืนตรงเพื่อตั้งศูนย์",
      missing: "ยังไม่ครบคู่ต้นขา + หน้าแข้ง",
      blocked: false,
    };
  }
  if (chapter === "combined") {
    if (detection === "full") {
      return {
        title: "นกบินต่ำ + พุ่งสุดแรง + ข้ามเหว",
        body: "หลบนกใช้ข้อเท้า เติมพลังใช้กดปลายเท้า กระโดดใช้มุมเข่า ยืนตรงแล้วตั้งศูนย์",
        missing: "ยังไม่ครบหน้าแข้ง + เท้า + ต้นขา",
        blocked: false,
      };
    }
    return {
      title: "นกบินต่ำ + พุ่งสุดแรง",
      body: "ป่าจังหวะโหมดนี้ใช้หน้าแข้ง + หลังเท้า หลบนกแล้วกดปลายเท้าพุ่ง ยืนตรงวางเท้าบนพื้นแล้วตั้งศูนย์",
      missing: "ยังไม่ครบคู่หน้าแข้ง + เท้า",
      blocked: false,
    };
  }
  return {
    title: "ใช้เซนเซอร์หน้าแข้ง + เท้า",
    body: "เกมนี้วัดมุมข้อเท้าจากหน้าแข้งและหลังเท้าข้างเดียวกัน ติดเซนเซอร์ที่หน้าแข้งกับหลังเท้า แล้วยืนตรงวางเท้าบนพื้นเพื่อตั้งศูนย์",
    missing: "ยังไม่ครบคู่หน้าแข้ง + เท้า",
    blocked: false,
  };
}

export function sideLabelFor(side: string | null) {
  if (side === "L") return "ขาซ้าย";
  if (side === "R") return "ขาขวา";
  return "ขา";
}
