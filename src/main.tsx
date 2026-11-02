import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SessionProvider } from "./hooks/useSession";
import { SettingsProvider } from "./hooks/useSettings";
import { flushOnClose } from "./lib/persist";
import "./index.css";

void flushOnClose();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <SessionProvider>
        <App />
      </SessionProvider>
    </SettingsProvider>
  </StrictMode>,
);
