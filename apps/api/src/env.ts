// 本 app 唯一读取 process.env 的地方(NEXT_PUBLIC_* 前端配置在 web 侧另有 lib/env.ts)。
// AI 相关默认值:文本按 claude-opus-4-8 定价($5/$25 每百万 token);embedding 默认 bge-m3
// (本地 Ollama,原生 1024 维,零调用成本)。
// 注意:embedding 模型必须与 Worker 侧一致,查询向量与库内向量才在同一空间。
export const apiEnv = {
  port: Number(process.env.API_PORT ?? 3001),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  /** 检索相似度下限;mock 伪向量分数无语义,本地开发用 0 关闭过滤(见 .env.example)。 */
  ragMinScore: Number(process.env.RAG_MIN_SCORE ?? 0),
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
