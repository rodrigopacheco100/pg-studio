import { createContext, useContext } from "react";
import { api } from "../api";
import type { Settings } from "../types";
import { usePersistedState } from "./usePersistedState";

interface SettingsApi {
  settings: Settings;
  /** Applies immediately and persists to `settings.json` (batching consecutive updates, such as a drag). */
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsApi | null>(null);

/** Single point of access to and change of the program settings; the file belongs to the backend. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { value, update } = usePersistedState(api.getSettings, api.setSettings);
  if (!value) return null;
  return <SettingsContext.Provider value={{ settings: value, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings outside SettingsProvider");
  return ctx;
}
