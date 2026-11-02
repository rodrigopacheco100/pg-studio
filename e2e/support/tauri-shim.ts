/**
 * Script injected into the page before the app loads. The frontend only reaches its backend through Tauri's
 * `invoke`; here that call is forwarded to the e2e server, which runs the app's real commands. `session`
 * selects the app instance (own SQLite, vault, settings) so tests do not see each other's data.
 * Dialog, event and window plugin calls have no backend in a browser and answer nothing, except the "save as"
 * dialog, which answers `window.__E2E_SAVE_PATH` (set by a test) so exports can be exercised.
 */
export function tauriShim(apiUrl: string, session: string): string {
  return `(() => {
    let callbacks = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
      transformCallback() { return ++callbacks; },
      unregisterCallback() {},
      convertFileSrc: (path) => path,
      async invoke(cmd, args) {
        if (cmd === "plugin:dialog|save") return window.__E2E_SAVE_PATH ?? null;
        if (cmd.startsWith("plugin:")) return null;
        const response = await fetch(${JSON.stringify(apiUrl)} + "/ipc", {
          method: "POST",
          headers: { "content-type": "application/json", "x-e2e-session": ${JSON.stringify(session)} },
          body: JSON.stringify({ cmd, args: args ?? {} }),
        });
        const out = await response.json();
        if ("err" in out) throw out.err;
        return out.ok;
      },
    };
  })();`;
}
