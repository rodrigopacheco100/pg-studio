import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "../api";
import { COLOR_TOKENS, parseTheme, resolveColors, type Theme } from "../lib/theme";
import { BUILTIN_THEMES, RESERVED_IDS } from "../lib/themes";
import { useSettings } from "./useSettings";

interface ThemeApi {
  /** Built-in themes first, then the imported ones. */
  themes: Theme[];
  /** The theme in effect (`system` resolves to the built-in dark or light one). */
  active: Theme;
  /** Whether the theme in effect is dark. */
  dark: boolean;
  /** Shows these colors instead of the active theme until called with `null` (the color editor's live preview). */
  setPreview: (preview: Pick<Theme, "type" | "colors"> | null) => void;
  /** Validates and stores a theme (replacing an imported one with the same id); returns it. Throws if invalid. */
  importTheme: (json: string) => Promise<Theme>;
  removeTheme: (id: string) => Promise<void>;
}

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const subscribeSystemDark = (notify: () => void) => {
  systemDark.addEventListener("change", notify);
  return () => systemDark.removeEventListener("change", notify);
};

const ThemeContext = createContext<ThemeApi | null>(null);

/**
 * Applies the chosen theme: its colors become the CSS variables the interface reads, and its type toggles
 * the `dark` class. Imported themes live in the backend's `styles` folder; a failure to read them leaves
 * the built-in ones.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const [custom, setCustom] = useState<Theme[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<Pick<Theme, "type" | "colors"> | null>(null);
  const osDark = useSyncExternalStore(subscribeSystemDark, () => systemDark.matches);

  const load = useCallback(async () => {
    const stored = await api.listThemes();
    const themes: Theme[] = [];
    for (const { id, content } of stored) {
      try {
        if (RESERVED_IDS.includes(id)) throw new Error("the name is taken by a built-in theme");
        themes.push({ ...parseTheme(content), id, builtin: false }); // the file name is the id
      } catch (e) {
        console.error(`Ignoring theme ${id}:`, e);
      }
    }
    setCustom(themes);
  }, []);
  useEffect(() => {
    load()
      .catch((e) => console.error("Could not read the imported themes:", e))
      .finally(() => setLoaded(true));
  }, [load]);

  const themes = useMemo(() => [...BUILTIN_THEMES, ...custom], [custom]);
  const active = useMemo(() => {
    const wanted = settings.theme === "system" ? (osDark ? "dark" : "light") : settings.theme;
    return themes.find((t) => t.id === wanted) ?? BUILTIN_THEMES[0];
  }, [themes, settings.theme, osDark]);

  const shown = preview ?? active;
  useLayoutEffect(() => {
    const root = document.documentElement;
    const colors = resolveColors(shown, BUILTIN_THEMES);
    for (const token of COLOR_TOKENS) root.style.setProperty(`--${token}`, colors[token]);
    root.classList.toggle("dark", shown.type === "dark");
  }, [shown]);

  const importTheme = useCallback(
    async (json: string) => {
      const parsed = parseTheme(json, RESERVED_IDS);
      await api.saveTheme(parsed.id, JSON.stringify({ name: parsed.name, type: parsed.type, colors: parsed.colors }, null, 2));
      await load();
      return { ...parsed, builtin: false };
    },
    [load],
  );

  const removeTheme = useCallback(
    async (id: string) => {
      await api.deleteTheme(id);
      await load();
    },
    [load],
  );

  // Wait for the imported themes: otherwise a chosen custom theme would flash as the dark one on startup.
  if (!loaded) return null;
  return <ThemeContext.Provider value={{ themes, active, dark: shown.type === "dark", setPreview, importTheme, removeTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
