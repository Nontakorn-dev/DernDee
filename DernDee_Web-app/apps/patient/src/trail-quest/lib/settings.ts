import { isCharacterId, type CharacterId } from "@trail/lib/game/characters";
import { isTrailKit, type TrailKit } from "@trail/lib/trailKit";

export type AppSettings = {
  muted: boolean;
  character: CharacterId;
  testKit: TrailKit;
};

const SETTINGS_KEY = "derndee-settings-v1";

export const DEFAULT_SETTINGS: AppSettings = {
  muted: false,
  character: "boy",
  testKit: "full",
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      muted: Boolean(parsed.muted),
      character: isCharacterId(parsed.character) ? parsed.character : DEFAULT_SETTINGS.character,
      testKit: isTrailKit(parsed.testKit) ? parsed.testKit : DEFAULT_SETTINGS.testKit,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
