// 本 app 唯一读取 process.env 的地方(NEXT_PUBLIC_* 前端配置在 web 侧另有 lib/env.ts)。
// AI 相关默认值:文本按 claude-opus-4-8 定价($5/$25 每百万 token);embedding 默认 bge-m3
// (本地 Ollama,原生 1024 维,零调用成本)。
// 注意:embedding 模型必须与 Worker 侧一致,查询向量与库内向量才在同一空间。

/**
 * APNS(移动端推送)凭据。token-based(.p8 JWT):需 Team ID、Key ID、私钥三者齐全才算配好,
 * 缺任一即返回 undefined —— 消费方(src/push/apns.ts)据此抛 PushNotConfiguredError(503),
 * 而非在缺配置时崩溃。私钥经 env 传入时换行常被转义成字面 "\n",这里还原成真换行。
 * bundleId 默认 iOS 应用的 bundle id(见 apps/ios),必须与 apns-topic 一致。
 */
function resolveApnsConfig() {
  const teamId = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  const privateKeyRaw = process.env.APNS_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKeyRaw) {
    return undefined;
  }
  return {
    teamId,
    keyId,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    bundleId: process.env.APNS_BUNDLE_ID ?? "dev.w3ctech.docpilot",
  } as const;
}

export const apiEnv = {
  port: Number(process.env.API_PORT ?? 3001),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  // 平台管理员邮箱白名单(逗号分隔)。/admin 后台的授权基础:不给 Better Auth 的 user
  // 表加角色字段,而用 env 白名单判定谁是平台 admin(见 cross-cutting.md §25)。
  // 规范化为小写去空,比对时大小写不敏感;留空即无人可访问 /admin。
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** 检索相似度下限;mock 伪向量分数无语义,本地开发用 0 关闭过滤(见 .env.example)。 */
  ragMinScore: Number(process.env.RAG_MIN_SCORE ?? 0),
  /** APNS 凭据;未配置时为 undefined(见 resolveApnsConfig)。 */
  apns: resolveApnsConfig(),
  ai: {
    answer: {
      model: process.env.AI_ANSWER_MODEL ?? "claude-opus-4-8",
      maxTokens: Number(process.env.AI_ANSWER_MAX_TOKENS ?? 8000),
      inputMicrosPerToken: Number(process.env.AI_ANSWER_INPUT_MICROS ?? 5),
      outputMicrosPerToken: Number(process.env.AI_ANSWER_OUTPUT_MICROS ?? 25),
    },
    embedding: {
      model: process.env.AI_EMBEDDING_MODEL ?? "bge-m3",
      embeddingMicrosPerToken: Number(process.env.AI_EMBEDDING_MICROS ?? 0),
    },
  },
} as const;
