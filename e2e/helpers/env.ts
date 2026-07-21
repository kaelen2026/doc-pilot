// e2e 测试套件唯一读取 process.env 的地方。各 URL 默认指向本地起的服务。
export const e2eEnv = {
  ci: Boolean(process.env.CI),
  webUrl: process.env.E2E_WEB_URL ?? "http://localhost:3000",
  apiUrl: process.env.E2E_API_URL ?? "http://localhost:3001",
  mailpitUrl: process.env.E2E_MAILPIT_URL ?? "http://localhost:8025",
  staging: {
    runId: process.env.STAGING_RUN_ID,
    resumeRunId: process.env.STAGING_RESUME_RUN_ID,
    postgresUser: process.env.STAGING_POSTGRES_USER,
    postgresDatabase: process.env.STAGING_POSTGRES_DB,
    costBudgetMicros: Number(process.env.STAGING_COST_BUDGET_MICROS ?? 5_000_000),
  },
} as const;
