// 本 app 唯一读取 process.env 的地方。
// AI 相关默认值:文本按 claude-opus-4-8 定价($5/$25 每百万 token);embedding 默认 bge-m3
// (本地 Ollama,原生 1024 维,零调用成本)。
// 注意:embedding 模型必须与 API 侧一致,查询向量与库内向量才在同一空间。

/**
 * APNS(移动端推送)凭据,与 apps/api/src/env.ts 的 resolveApnsConfig 同源同语义:
 * token-based(.p8 JWT),三项齐全才算配好,缺任一返回 undefined —— 消费方(src/push/apns.ts)
 * 据此**不接推送通路**(推送是 best-effort,缺配置就跳过,绝不拖垮文档处理)。私钥经 env 传入
 * 时换行常被转义成字面 "\n",这里还原。bundleId 默认与 iOS 应用一致(apns-topic 必须匹配)。
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

function resolveFcmConfig() {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!value.project_id || !value.client_email || !value.private_key) return undefined;
    return {
      projectId: value.project_id,
      clientEmail: value.client_email,
      privateKey: value.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return undefined;
  }
}

export const workerEnv = {
  /** APNS 凭据;未配置时为 undefined(见 resolveApnsConfig)。 */
  apns: resolveApnsConfig(),
  fcm: resolveFcmConfig(),
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  outboxPollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000),
  summary: {
    /** 小文档阈值(token):不超过则全文一次生成摘要。 */
    smallDocTokens: Number(process.env.AI_SUMMARY_SMALL_DOC_TOKENS ?? 12000),
    /** 大文档分章节局部摘要的每组 token 预算。 */
    sectionTokens: Number(process.env.AI_SUMMARY_SECTION_TOKENS ?? 6000),
  },
  ai: {
    summarize: {
      model: process.env.AI_SUMMARIZE_MODEL ?? "claude-opus-4-8",
      maxTokens: Number(process.env.AI_SUMMARIZE_MAX_TOKENS ?? 16000),
      inputMicrosPerToken: Number(process.env.AI_SUMMARIZE_INPUT_MICROS ?? 5),
      outputMicrosPerToken: Number(process.env.AI_SUMMARIZE_OUTPUT_MICROS ?? 25),
    },
    embedding: {
      model: process.env.AI_EMBEDDING_MODEL ?? "bge-m3",
      embeddingMicrosPerToken: Number(process.env.AI_EMBEDDING_MICROS ?? 0),
    },
  },
} as const;
