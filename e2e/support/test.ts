import { test as base, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Studio } from "./studio";
import { tauriShim } from "./tauri-shim";

const API = process.env.E2E_API_URL ?? "http://backend:1430";

/** A `studio` fixture: the app open in a browser, backed by its own fresh app instance on the backend. */
export const test = base.extend<{ studio: Studio }>({
  studio: async ({ page }, use) => {
    await page.addInitScript(tauriShim(API, `t-${randomUUID()}`));
    const studio = new Studio(page);
    await studio.open();
    await use(studio);
  },
});

export { expect };
