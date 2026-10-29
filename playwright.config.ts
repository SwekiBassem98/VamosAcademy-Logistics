import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout dans un vrai navigateur, sur le build de PRODUCTION et une base dédiée (*_test).
 *   npm run test:e2e
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://MAC@localhost:5432/vamos_e2e_test?schema=public";
const PORT = 3200;
const env = { DATABASE_URL: E2E_DB, NEXT_DIST_DIR: ".next-e2e", COOKIE_SECURE: "false", STORAGE_DIR: ".e2e-storage" };

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "fr-FR", timezoneId: "Africa/Tunis", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env,
  },
});
