// 本包唯一读取 process.env 的地方。认证与邮件发信配置集中于此。
// 注意:secret 的默认值仅供本地开发,生产必须通过 BETTER_AUTH_SECRET 覆盖。
export const authEnv = {
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
  trustedOrigins: (
    process.env.AUTH_TRUSTED_ORIGINS ??
    "http://localhost:3000,http://localhost:3001,docpilot://,https://appleid.apple.com"
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
  // clientId/secret 是 Web 类型 client(web One Tap / OAuth 用);iosClientId 是「iOS 类型」
  // OAuth client,原生 iOS 登录签发的 idToken 其 aud 是这个 iOS client id 而非 web 的,
  // 故作为额外 audience 加进 better-auth google 的 clientId 数组(见 social.ts)。
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    iosClientId: process.env.GOOGLE_IOS_CLIENT_ID ?? "",
    androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID ?? "",
  },
  // Apple「Sign in with Apple」凭据;缺省空串表示未配置——resolveSocialProviders 会据此跳过注册。
  // client secret 不直接配,而是由 teamId/keyId/privateKey 用 jose 动态生成 ES256 JWT
  // (Apple 上限 6 个月,动态生成免手动轮换)。clientId 为 Apple Service ID(web OAuth 用);
  // 原生 iOS idToken 的 aud 是 App bundle id 而非 Service ID,故另配 appBundleIdentifier
  // 供 verifyIdToken 校验(见 social.ts)。
  apple: {
    clientId: process.env.APPLE_CLIENT_ID ?? "",
    teamId: process.env.APPLE_TEAM_ID ?? "",
    keyId: process.env.APPLE_KEY_ID ?? "",
    // .p8 私钥(PEM,含 -----BEGIN PRIVATE KEY-----)。.env 单行存储时换行写作字面量 \n,
    // 这里还原成真实换行,jose importPKCS8 才能解析。
    privateKey: (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER ?? "",
  },
} as const;
