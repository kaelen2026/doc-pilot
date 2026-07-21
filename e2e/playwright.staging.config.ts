import { defineConfig, devices } from "@playwright/test";
import { e2eEnv } from "./helpers/env";

export default defineConfig({
  testDir: "./tests",
  testMatch: "staging-capacity.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 35 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-staging" }]],
  use: {
    baseURL: e2eEnv.webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
