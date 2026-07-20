// e2e 测试套件唯一读取 process.env 的地方。各 URL 默认指向本地起的服务。
export const e2eEnv = {
  ci: Boolean(process.env.CI),
  webUrl: process.env.E2E_WEB_URL ?? "http://localhost:3000",
  apiUrl: process.env.E2E_API_URL ?? "http://localhost:3001",
  mailpitUrl: process.env.E2E_MAILPIT_URL ?? "http://localhost:8025",
} as const;
