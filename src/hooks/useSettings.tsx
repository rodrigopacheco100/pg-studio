import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from "react";
import { api } from "../api";
import { EDITOR_FONTS, pickFont, UI_FONTS } from "../lib/fonts";
import type { Settings } from "../types";
import { usePersistedState } from "./usePersistedState";

interface SettingsApi {
  settings: Settings;
  /** Whether the dark palette is in effect (the `system` theme follows the OS). */
  dark: boolean;
  /** Applies immediately and persists to `settings.json` (batching consecutive updates, such as a drag). */
  update: (patch: Partial<Settings>) => void;
}

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const subscribeSystemDark = (notify: () => void) => {
  systemDark.addEventListener("change", notify);
  return () => systemDark.removeEventListener("change", notify);
};

const SettingsContext = createContext<SettingsApi | null>(null);

/** Single point of access to and change of the program settings; the file belongs to the backend. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { value, update } = usePersistedState(api.getSettings, api.setSettings);
  const osDark = useSyncExternalStore(subscribeSystemDark, () => systemDark.matches);
  const dark = value ? (value.theme === "system" ? osDark : value.theme === "dark") : true;
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Fonts are CSS variables on the root (see index.css), so a change restyles the whole app at once.
  useLayoutEffect(() => {
    if (!value) return;
    const root = document.documentElement.style;
    root.setProperty("--app-font-sans", pickFont(UI_FONTS, value.uiFont).family);
    root.setProperty("--app-font-mono", pickFont(EDITOR_FONTS, value.editorFont).family);
    root.setProperty("--app-editor-font-size", `${value.editorFontSize}px`);
    document.documentElement.style.fontSize = `${value.uiFontSize}px`; // Tailwind sizes are rem-based
  }, [value]);

  if (!value) return null;
  return <SettingsContext.Provider value={{ settings: value, dark, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings outside SettingsProvider");
  return ctx;
}
