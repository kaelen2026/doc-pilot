import {
  type AIGateway,
  ANSWER_CITATIONS_MARKER,
  createAIGateway,
  createAnthropicAdapter,
  createMockAdapter,
  createOpenAIEmbeddingAdapter,
  createPromptRegistry,
  documentAnswerPromptV1,
} from "@doc-pilot/ai";
import { EMBEDDING_DIMENSIONS } from "@doc-pilot/contracts";
import { createAiGenerationRecorder, db } from "@doc-pilot/database";

let instance: AIGateway | undefined;

/**
 * API 侧 AI Gateway 单例(ADR-006):问答 streamText 走 Anthropic,
 * 查询向量化走 OpenAI 兼容端点;对应 Key 缺失时回落 Mock(本地/CI 零网络可跑,
 * mock 的问答输出固定为符合两段式协议的显式拒答)。
 */
export function apiAIGateway(): AIGateway {
  if (!instance) {
    instance = build();
  }
  return instance;
}

function build(): AIGateway {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (!hasAnthropic) {
    console.warn("[api] ANTHROPIC_API_KEY 未设置,answer 使用 mock adapter(占位拒答)");
  }
  if (!hasOpenAI) {
    console.warn("[api] OPENAI_API_KEY 未设置,embedding 使用 mock adapter(哈希伪向量)");
  }

  return createAIGateway({
    routes: {
      answer: {
        provider: hasAnthropic ? "anthropic" : "mock",
        model: process.env.AI_ANSWER_MODEL ?? "claude-opus-4-8",
        maxTokens: Number(process.env.AI_ANSWER_MAX_TOKENS ?? 8000),
        // 缺省按 claude-opus-4-8 定价($5/$25 每百万 token)。
        pricing: {
          inputMicrosPerToken: Number(process.env.AI_ANSWER_INPUT_MICROS ?? 5),
          outputMicrosPerToken: Number(process.env.AI_ANSWER_OUTPUT_MICROS ?? 25),
        },
      },
      embedding: {
        provider: hasOpenAI ? "openai" : "mock",
        // 必须与 Worker 侧 embedding 路由一致,查询向量与库内向量才在同一空间。
        model: process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small",
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
      mock: createMockAdapter({
        embeddingDim: EMBEDDING_DIMENSIONS,
        streamChunks: [
          "未配置 ANTHROPIC_API_KEY,",
          "无法基于文档生成回答,这是本地占位拒答。",
          `\n${ANSWER_CITATIONS_MARKER}\n`,
          '{"insufficientEvidence": true, "citations": []}',
        ],
      }),
    },
    prompts: createPromptRegistry([documentAnswerPromptV1]),
    hooks: createAiGenerationRecorder(db),
  });
}
