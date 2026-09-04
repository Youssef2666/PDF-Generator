import { defineConfig, devices } from "@playwright/test";

/**
 * One smoke test, run against a real dev server.
 *
 * It uses its own data and output directories so a run can never touch a
 * real in-progress draft or overwrite a delivered package — the same
 * COURSE_REPORT_* seams the unit tests use.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // The export renders three Office documents; give it room on a cold start.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev --port 3100",
    url: "http://localhost:3100/course",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      COURSE_REPORT_DATA_DIR: "e2e/.tmp/data",
      COURSE_REPORT_OUTPUT_DIR: "e2e/.tmp/output",
    },
  },
});
