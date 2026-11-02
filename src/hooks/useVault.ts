import { useCallback } from "react";
import { api, errText } from "../api";
import { useDialogs } from "./useDialogs";

/**
 * Returns a function that makes sure saved passwords can be read and written: immediately true with a
 * system keychain; otherwise asks for the master password (creating the vault on first use).
 * Resolves false when cancelled or when it failed (already reported to the user).
 */
export function useVault() {
  const dialogs = useDialogs();
  return useCallback(async (): Promise<boolean> => {
    try {
      const status = await api.vaultStatus();
      if (status.keychainProblem === null || status.vault === "unlocked") return true;
      if (status.vault === "none") {
        const master = await dialogs.prompt(
          "There is no system keychain here, so saved passwords are encrypted with a master password. It cannot be recovered if forgotten.",
          "Create master password",
          { secret: true },
        );
        if (!master) return false;
        const again = await dialogs.prompt("Repeat the master password", "Create master password", { secret: true });
        if (again === null) return false;
        if (again !== master) {
          await dialogs.alert("The passwords do not match.");
          return false;
        }
        await api.vaultOpen(master, true);
      } else {
        const master = await dialogs.prompt("Master password for the saved passwords", "Unlock", { secret: true });
        if (master === null) return false;
        await api.vaultOpen(master, false);
      }
      return true;
    } catch (e) {
      await dialogs.alert(errText(e));
      return false;
    }
  }, [dialogs]);
}
