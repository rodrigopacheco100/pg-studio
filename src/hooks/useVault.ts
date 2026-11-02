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
      /** Runs `action`; its failure becomes the message shown inside the prompt, which then stays open. */
      const attempt = async (action: () => Promise<void>) => {
        try {
          await action();
          return null;
        } catch (e) {
          return errText(e);
        }
      };
      if (status.vault === "none") {
        const master = await dialogs.prompt(
          "There is no system keychain here, so saved passwords are encrypted with a master password. It cannot be recovered if forgotten.",
          "Create master password",
          { secret: true, validate: async (v) => (v ? null : "The master password cannot be empty") },
        );
        if (master === null) return false;
        const created = await dialogs.prompt("Repeat the master password", "Create master password", {
          secret: true,
          validate: async (again) => (again === master ? attempt(() => api.vaultOpen(master, true)) : "The passwords do not match"),
        });
        return created !== null;
      }
      const unlocked = await dialogs.prompt("Master password for the saved passwords", "Unlock", {
        secret: true,
        validate: (master) => attempt(() => api.vaultOpen(master, false)),
      });
      return unlocked !== null;
    } catch (e) {
      await dialogs.alert(errText(e));
      return false;
    }
  }, [dialogs]);
}
