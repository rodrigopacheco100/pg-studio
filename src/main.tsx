import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DialogsProvider } from "./hooks/useDialogs";
import { SessionProvider } from "./hooks/useSession";
import { SettingsProvider } from "./hooks/useSettings";
import { ThemeProvider } from "./hooks/useTheme";
import { flushOnClose } from "./lib/persist";
import "./index.css";

void flushOnClose();

// The webview's own menu (Back, Reload, Inspect…) has no place in the app: the places that need a
// context menu render theirs (Radix handles the event first, this only blocks the native one).
window.addEventListener("contextmenu", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DialogsProvider>
      <SettingsProvider>
        <ThemeProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ThemeProvider>
      </SettingsProvider>
    </DialogsProvider>
  </StrictMode>,
);
