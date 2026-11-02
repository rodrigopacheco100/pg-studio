import { defineConfig } from "@playwright/test";

// Runs inside the `tests` container of docker-compose.yml, against the `web` service.
export default defineConfig({
  testDir: "./tests",
  outputDir: "./reports/results",
  reporter: [["list"], ["html", { outputFolder: "./reports/html", open: "never" }]],
  // Every test gets its own app instance on the backend (see support/app.ts), so they can run in parallel.
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://web",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
