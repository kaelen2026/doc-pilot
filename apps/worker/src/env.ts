// 本 app 唯一读取 process.env 的地方。
// AI 相关默认值:文本按 claude-opus-4-8 定价($5/$25 每百万 token);embedding 默认 bge-m3
// (本地 Ollama,原生 1024 维,零调用成本)。
// 注意:embedding 模型必须与 API 侧一致,查询向量与库内向量才在同一空间。
export const workerEnv = {
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
