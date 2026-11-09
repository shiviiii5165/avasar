import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Browser regression tests for the signed-in student dashboard.
 *  - Isolated data: the app runs against a fresh embedded database in <tmp>/avsar-playwright/pglite (AVSAR_EMBEDDED_DB=1),
 *    seeded with sample listings. A DATABASE_URL in .env.local is never used.
 *  - Safe sign-in: the development persona (AVSAR_DEV_AUTH=1) and the LOCAL MOCK of AI Tathastu
 *    (scripts/mock-ait.mts). No production account, provider or database is touched.
 * Run: npm run test:e2e
 */
const APP_PORT = 3300;
const MOCK_PORT = 3401;
export const APP = `http://localhost:${APP_PORT}`;
export const MOCK = `http://localhost:${MOCK_PORT}`;
// Outside the project: the dev server's file watcher reloads open pages when files inside it change.
// CI points AVSAR_E2E_OUT at the runner's temp folder so reports can be uploaded (folder name must stay "avsar-playwright").
const OUT = process.env.AVSAR_E2E_OUT || path.join(os.tmpdir(), "avsar-playwright");
export const AUTH_STATE = path.join(OUT, "auth", "candidate.json");

export default defineConfig({
  testDir: "e2e",
  outputDir: path.join(OUT, "results"),
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1, // one shared database and one mock provider
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: path.join(OUT, "report") }]] : "list",
  use: { baseURL: APP, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", testMatch: /dashboard\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: AUTH_STATE } },
    { name: "responsive", testMatch: /responsive\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE } },
    { name: "profile-import-mock", testMatch: /profile-import\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: [
    {
      command: "npx tsx scripts/mock-ait.mts",
      url: `${MOCK}/api/integrations/jwks`,
      reuseExistingServer: false,
      env: { MOCK_AIT_PORT: String(MOCK_PORT), MOCK_AIT_CLIENT_ID: "avsar", MOCK_AIT_CLIENT_SECRET: "mock-only-secret", MOCK_AIT_CLIENT_ORIGIN: APP },
    },
    {
      command: "node e2e/start-app.mjs",
      url: `${APP}/api/health/live`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        PORT: String(APP_PORT),
        AVSAR_EMBEDDED_DB: "1",
        AVSAR_PGLITE_DIR: path.join(OUT, "pglite"),
        AVSAR_DEV_AUTH: "1",
        AVSAR_PUBLIC_URL: APP,
        AVSAR_AIT_BASE_URL: MOCK,
        AVSAR_AIT_CLIENT_ID: "avsar",
        AVSAR_AIT_CLIENT_SECRET: "mock-only-secret",
        AVSAR_AIT_REDIRECT_URI: `${APP}/api/auth/tathastu/callback`,
        AVSAR_AI_PROVIDER: "rules",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
