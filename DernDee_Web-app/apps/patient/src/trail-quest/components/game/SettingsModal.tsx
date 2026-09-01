import { HeaderIconButton } from "@trail/components/game/GameHeader";
import { CHARACTERS, type CharacterId } from "@trail/lib/game/characters";
import type { TrailKit } from "@trail/lib/trailKit";

export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <HeaderIconButton label="ตั้งค่า" onClick={onClick}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M19.4 13a7.7 7.7 0 0 0 .1-2l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3h-6l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.7 7.7 0 0 0 .1 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 1.7 1L9 21h6l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </HeaderIconButton>
  );
}

export function SettingsModal({
  open,
  muted,
  character,
  onClose,
  onMutedChange,
  onCharacterChange,
  showTestKit = false,
  testKit = "full",
  onTestKitChange,
}: {
  open: boolean;
  muted: boolean;
  character: CharacterId;
  onClose: () => void;
  onMutedChange: (muted: boolean) => void;
  onCharacterChange: (id: CharacterId) => void;
  showTestKit?: boolean;
  testKit?: TrailKit;
  onTestKitChange?: (kit: TrailKit) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-800">ตั้งค่า</h2>
          <button
            type="button"
            aria-label="ปิด"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <section className="mt-5">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">เสียง</div>
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            onClick={() => onMutedChange(!muted)}
            className="mt-2 flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
          >
            <div className="text-left">
              <div className="text-[15px] font-bold text-slate-800">เสียงในเกม</div>
              <div className="text-sm text-slate-500">{muted ? "ปิดอยู่" : "เปิดอยู่"}</div>
            </div>
            <span
              className={`relative h-7 w-12 rounded-full transition-colors ${
                muted ? "bg-slate-300" : "bg-emerald-500"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  muted ? "left-0.5" : "left-[1.35rem]"
                }`}
              />
            </span>
          </button>
        </section>

        <section className="mt-6">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">ตัวละคร</div>
          <p className="mt-1 text-sm text-slate-500">เลือกการ์ตูนที่จะวิ่งในฉาก</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {CHARACTERS.map((item) => {
              const selected = item.id === character;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onCharacterChange(item.id)}
                  className={`rounded-2xl p-2 text-center transition ${
                    selected
                      ? "bg-blue-50 ring-2 ring-blue-500"
                      : "bg-slate-50 ring-1 ring-transparent hover:ring-slate-200"
                  }`}
                >
                  <div className="aspect-square overflow-hidden rounded-xl bg-[#b7e4f6]">
                    <img
                      src={item.poster}
                      alt={item.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="mt-2 text-xs font-bold leading-tight text-slate-800">{item.name}</div>
                  <div className="text-[10px] font-medium text-slate-400">{item.nameEn}</div>
                </button>
              );
            })}
          </div>
        </section>

        {showTestKit ? (
          <section className="mt-6">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">โหมดทดสอบ</div>
            <p className="mt-1 text-sm text-slate-500">
              เลือกชุดเกมให้เหมือนตอนเล่นจาก Therapy ตามเซนเซอร์ที่ติด
            </p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => onTestKitChange?.("ankle")}
                className={`rounded-2xl px-4 py-3 text-left ${
                  testKit === "ankle" ? "bg-blue-50 ring-2 ring-blue-500" : "bg-slate-50"
                }`}
              >
                <div className="text-[15px] font-bold text-slate-800">นกบินต่ำ + พุ่งสุดแรง</div>
                <div className="text-sm text-slate-500">เหมือนติดหน้าแข้ง + หลังเท้า</div>
              </button>
              <button
                type="button"
                onClick={() => onTestKitChange?.("full")}
                className={`rounded-2xl px-4 py-3 text-left ${
                  testKit === "full" ? "bg-blue-50 ring-2 ring-blue-500" : "bg-slate-50"
                }`}
              >
                <div className="text-[15px] font-bold text-slate-800">นกบินต่ำ + พุ่งสุดแรง + ข้ามเหว</div>
                <div className="text-sm text-slate-500">เหมือนติดหน้าแข้ง + หลังเท้า + ต้นขา</div>
              </button>
            </div>
          </section>
        ) : null}

        <button
          type="button"
          className="mt-6 min-h-12 w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white hover:bg-blue-700"
          onClick={onClose}
        >
          เสร็จแล้ว
        </button>
      </div>
    </div>
  );
}
