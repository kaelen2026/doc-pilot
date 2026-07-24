import { defineConfig, devices } from "@playwright/test";
import { e2eEnv } from "./helpers/env";

const isCI = e2eEnv.ci;

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
  testIgnore: "staging-capacity.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
    // 视觉基线对比:动画快进到终态消除截图时机抖动;容差只兜亚像素级抗锯齿差异,
    // 不用来掩盖真实的视觉回归(见 e2e/README.md「视觉回归」)。
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.01 },
  },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: e2eEnv.webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ["staging-capacity.spec.ts", "visual.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    // 视觉回归双视口(仅 visual.spec.ts):桌面 + 移动。retries 必须为 0——
    // 基线缺失时首跑会「写入基线并失败」,若允许重试,第二次会拿刚写入的基线对比
    // 而假绿,门禁就被静默架空(基线永远进不了仓库)。
    {
      name: "visual-desktop",
      testMatch: "visual.spec.ts",
      retries: 0,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "visual-mobile",
      testMatch: "visual.spec.ts",
      retries: 0,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
});
