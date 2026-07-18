import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

/**
 * DocPilot E2E(testing-and-eval.md §30.4)。
 *
 * 不由 Playwright 拉起服务:问答闭环需要 web + api + worker 三个进程外加
 * postgres / redis / minio / mailpit,worker 无 HTTP 端口无法被 webServer 轮询。
 * 因此服务的启动交给外部——本地 `pnpm dev:local`,CI 在 workflow 里后台拉起并等就绪。
 * 详见 e2e/README.md。
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
