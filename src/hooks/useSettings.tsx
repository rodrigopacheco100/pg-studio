import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, errText } from "../api";
import type { Settings } from "../types";

const SAVE_DELAY_MS = 300;

interface SettingsApi {
  settings: Settings;
  /** Applies immediately and persists to `settings.json` (batching consecutive updates, such as a drag). */
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsApi | null>(null);

/** Single point of access to and change of the program settings; the file belongs to the backend. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const latest = useRef<Settings | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void api.getSettings().then((s) => { latest.current = s; setSettings(s); });
  }, []);

  useEffect(() => () => {
    // Does not lose the last change if the provider unmounts before the delay.
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      if (latest.current) void api.setSettings(latest.current);
    }
  }, []);

  function update(patch: Partial<Settings>) {
    if (!latest.current) return;
    latest.current = { ...latest.current, ...patch };
    setSettings(latest.current);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      api.setSettings(latest.current!).catch((e) => console.error(`Failed to save settings: ${errText(e)}`));
    }, SAVE_DELAY_MS);
  }

  if (!settings) return null;
  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings outside SettingsProvider");
  return ctx;
}
