import { getCurrentWindow } from "@tauri-apps/api/window";

export interface Saver<T> {
  /** Saves `value` after a quiet period, collapsing bursts of calls into one write. */
  schedule: (value: T) => void;
  /** Writes the pending value, if any, right now. */
  flush: () => Promise<void>;
}

const savers = new Set<Saver<never>>();

export function createSaver<T>(save: (value: T) => Promise<void>, delayMs = 300): Saver<T> {
  let timer: number | undefined;
  let pending: { value: T } | null = null;
  const saver: Saver<T> = {
    schedule(value) {
      pending = { value };
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void saver.flush(), delayMs);
    },
    async flush() {
      window.clearTimeout(timer);
      const next = pending;
      pending = null;
      if (next) await save(next.value).catch((e) => console.error("Failed to persist state:", e));
    },
  };
  savers.add(saver as Saver<never>);
  return saver;
}

/** Writes everything still pending before the window closes. Call once at startup. */
export function flushOnClose() {
  return getCurrentWindow().onCloseRequested(async () => {
    await Promise.all([...savers].map((s) => s.flush()));
  });
}
