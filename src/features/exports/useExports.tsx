import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/api";
import { ExportWindows } from "./ExportWindows";
import { isRunning } from "./exportProgress";
import type { ExportEntry, ExportRequest } from "@/types";

/** How often the progress of running exports is read from the local database. */
const POLL_MS = 400;

export interface ExportsApi {
  /** Every export on record, newest first. */
  entries: ExportEntry[];
  /** Ids that have a floating window: the exports started in this session and not closed yet. */
  windows: number[];
  minimized: ReadonlySet<number>;
  start: (request: ExportRequest) => Promise<void>;
  cancel: (id: number) => Promise<void>;
  /** Hides the window of a finished export; it stays in the history. */
  close: (id: number) => void;
  toggleMinimized: (id: number) => void;
  /** Reads the history again. */
  refresh: () => Promise<void>;
  /** Forgets the finished exports. */
  clear: () => Promise<void>;
}

const ExportsContext = createContext<ExportsApi | null>(null);

/**
 * Exports run in the backend; this follows them by polling their records while any is running, and keeps
 * which have a floating window (`ExportWindows`, rendered here so it floats over every view).
 */
export function ExportsProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<ExportEntry[]>([]);
  const [windows, setWindows] = useState<number[]>([]);
  const [minimized, setMinimized] = useState<ReadonlySet<number>>(new Set());

  const refresh = useCallback(() => api.listExports().then(setEntries), []);
  useEffect(() => void refresh().catch(() => {}), [refresh]);

  const running = entries.some(isRunning);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void refresh().catch(() => {}), POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, refresh]);

  const api_ = useMemo<ExportsApi>(
    () => ({
      entries,
      windows,
      minimized,
      start: async (request) => {
        const id = await api.startExport(request);
        setWindows((w) => [id, ...w]);
        await refresh();
      },
      cancel: (id) => api.cancelExport(id),
      close: (id) => setWindows((w) => w.filter((x) => x !== id)),
      toggleMinimized: (id) =>
        setMinimized((m) => {
          const next = new Set(m);
          if (!next.delete(id)) next.add(id);
          return next;
        }),
      refresh,
      clear: async () => {
        await api.clearExports();
        await refresh();
      },
    }),
    [entries, windows, minimized, refresh],
  );

  return (
    <ExportsContext.Provider value={api_}>
      {children}
      <ExportWindows />
    </ExportsContext.Provider>
  );
}

export function useExports(): ExportsApi {
  const ctx = useContext(ExportsContext);
  if (!ctx) throw new Error("useExports needs an ExportsProvider");
  return ctx;
}
