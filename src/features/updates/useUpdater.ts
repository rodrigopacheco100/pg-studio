import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useState } from "react";

/** Looks for a newer version of the app; the one found (if any) waits in `available` until it is dismissed. */
export function useUpdater() {
  const [available, setAvailable] = useState<Update | null>(null);

  /**
   * `"building"`: a release exists but its package for this system is not published yet (the manifest lacks the
   * platform while the release workflow is still running). Rejects when the update server cannot be reached;
   * callers decide whether that is worth telling the user.
   */
  const lookUp = useCallback(async (): Promise<"available" | "current" | "building"> => {
    try {
      const update = await check();
      setAvailable(update);
      return update ? "available" : "current";
    } catch (e) {
      if (/fallback platforms/.test(String(e))) return "building";
      throw e;
    }
  }, []);

  return { available, lookUp, dismiss: useCallback(() => setAvailable(null), []) };
}
