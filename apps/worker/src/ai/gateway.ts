import {
  type AIGateway,
  createAIGateway,
  createAnthropicAdapter,
  createMockAdapter,
  createOpenAIEmbeddingAdapter,
  createPromptRegistry,
  documentSummaryPromptV1,
  documentSummarySectionPromptV1,
} from "@doc-pilot/ai";
import { EMBEDDING_DIMENSIONS } from "@doc-pilot/contracts";
import { createAiGenerationRecorder, db } from "@doc-pilot/database";

let instance: AIGateway | undefined;

/**
 * Worker 侧 AI Gateway 单例(ADR-006:业务代码只经此调用 AI)。
 * - summarize 路由 Anthropic,embedding 路由 OpenAI 兼容端点(Anthropic 无 embedding API);
 * - 对应 API Key 缺失时该能力回落 Mock Adapter(本地/CI 零网络跑通全流程)。
 * - Usage/Trace 通过 createAiGenerationRecorder 落 ai_generations 表。
 */
export function workerAIGateway(): AIGateway {
  if (!instance) {
    instance = build();
  }
  return instance;
}

function build(): AIGateway {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (!hasAnthropic) {
    console.warn("[worker] ANTHROPIC_API_KEY 未设置,summarize 使用 mock adapter(占位摘要)");
  }
  if (!hasOpenAI) {
    console.warn("[worker] OPENAI_API_KEY 未设置,embedding 使用 mock adapter(哈希伪向量)");
  }

  return createAIGateway({
    routes: {
      summarize: {
        provider: hasAnthropic ? "anthropic" : "mock",
        model: process.env.AI_SUMMARIZE_MODEL ?? "claude-opus-4-8",
        maxTokens: Number(process.env.AI_SUMMARIZE_MAX_TOKENS ?? 16000),
        // 缺省按 claude-opus-4-8 定价($5/$25 每百万 token);换模型时用环境变量同步调整。
        pricing: {
          inputMicrosPerToken: Number(process.env.AI_SUMMARIZE_INPUT_MICROS ?? 5),
          outputMicrosPerToken: Number(process.env.AI_SUMMARIZE_OUTPUT_MICROS ?? 25),
        },
      },
      embedding: {
        provider: hasOpenAI ? "openai" : "mock",
        // text-embedding-3-small 输出 1536 维,与 document_chunks.embedding 一致。
        model: process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small",
        // 缺省按 text-embedding-3-small 定价($0.02 每百万 token)。
        pricing: {
          inputMicrosPerToken: 0,
          outputMicrosPerToken: 0,
          embeddingMicrosPerToken: Number(process.env.AI_EMBEDDING_MICROS ?? 0.02),
        },
      },
    },
    adapters: {
      ...(hasAnthropic ? { anthropic: createAnthropicAdapter() } : {}),
      ...(hasOpenAI ? { openai: createOpenAIEmbeddingAdapter() } : {}),
      mock: devMockAdapter(),
    },
    prompts: createPromptRegistry([documentSummaryPromptV1, documentSummarySectionPromptV1]),
    hooks: createAiGenerationRecorder(db),
  });
}

/** 占位响应同时满足章节摘要与最终摘要两个 Schema(zod 会剥掉多余字段)。 */
function devMockAdapter() {
  return createMockAdapter({
    // 伪向量必须与真实维度一致,否则写不进 vector(1536) 列。
    embeddingDim: EMBEDDING_DIMENSIONS,
    objectResponse: {
      section: "全文",
      summary: "本地开发占位摘要:未配置 ANTHROPIC_API_KEY,未调用真实模型。",
      keyPoints: ["占位要点"],
      overview: "本地开发占位摘要:未配置 ANTHROPIC_API_KEY,未调用真实模型。",
      topics: ["占位主题"],
      questionsWorthAsking: ["这份文档的核心结论是什么?"],
    },
  });
}
