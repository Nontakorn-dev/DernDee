import { isCharacterId, type CharacterId } from "@trail/lib/game/characters";
import { isTrailKit, type TrailKit } from "@trail/lib/trailKit";
import { useEffect, useState } from "react";

export type AppSettings = {
  muted: boolean;
  character: CharacterId;
  testKit: TrailKit;
  animation: boolean;
};

const SETTINGS_KEY = "derndee-settings-v1";
export const SETTINGS_EVENT = "derndee-settings";

export const DEFAULT_SETTINGS: AppSettings = {
  muted: false,
  character: "boy",
  testKit: "full",
  animation: true,
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
      animation: parsed.animation !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
  return next;
}

export function useAnimationEnabled() {
  const [enabled, setEnabled] = useState(() => loadSettings().animation);
  useEffect(() => {
    const sync = () => setEnabled(loadSettings().animation);
    window.addEventListener(SETTINGS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return enabled;
}
