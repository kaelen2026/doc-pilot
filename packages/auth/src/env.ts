// 本包唯一读取 process.env 的地方。认证与邮件发信配置集中于此。
// 注意:secret 的默认值仅供本地开发,生产必须通过 BETTER_AUTH_SECRET 覆盖。
export const authEnv = {
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
  trustedOrigins: (
    process.env.AUTH_TRUSTED_ORIGINS ?? "http://localhost:3000,http://localhost:3001,docpilot://"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  smtp: {
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    from: process.env.MAIL_FROM ?? "DocPilot <no-reply@docpilot.local>",
  },
  // Google OAuth 凭据;缺省空串表示未配置——resolveSocialProviders 会据此跳过注册。
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
} as const;
