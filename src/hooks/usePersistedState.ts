import { useEffect, useRef, useState } from "react";
import { createSaver } from "@/lib/persist";

/**
 * State loaded once from the backend and written back (debounced) on every change.
 * `value` is `null` until the load finishes.
 */
export function usePersistedState<T extends object>(load: () => Promise<T>, save: (value: T) => Promise<void>) {
  const [value, setValue] = useState<T | null>(null);
  const latest = useRef<T | null>(null);
  const saver = useRef(createSaver(save));

  useEffect(() => {
    void load().then((v) => { latest.current = v; setValue(v); });
    const s = saver.current;
    return () => void s.flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  function update(patch: Partial<T>) {
    if (!latest.current) return;
    latest.current = { ...latest.current, ...patch };
    setValue(latest.current);
    saver.current.schedule(latest.current);
  }

  return { value, update };
}
