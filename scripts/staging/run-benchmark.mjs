import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { GENERATED_ENV, MAILPIT_URL, ROOT } from "./constants.mjs";

if (!existsSync(GENERATED_ENV)) {
  console.error("请先运行 pnpm staging:prepare 和 pnpm staging:up");
  process.exit(1);
}
const stagingEnv = parseEnv(readFileSync(GENERATED_ENV, "utf8"));
const runId = `local-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const result = spawnSync(
  "pnpm",
  [
    "--filter",
    "@doc-pilot/e2e",
    "exec",
    "playwright",
    "test",
    "--config",
    "playwright.staging.config.ts",
  ],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_WEB_URL: "http://localhost:3300",
      E2E_API_URL: "http://localhost:3301",
      E2E_MAILPIT_URL: MAILPIT_URL,
      STAGING_RUN_ID: runId,
      STAGING_POSTGRES_USER: stagingEnv.POSTGRES_USER,
      STAGING_POSTGRES_DB: stagingEnv.POSTGRES_DB,
      STAGING_COST_BUDGET_MICROS: "5000000",
    },
  },
);
process.exit(result.status ?? 1);
