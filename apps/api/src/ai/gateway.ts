import {
  type AIGateway,
  createAIGateway,
  createAnthropicAdapter,
  createMockAdapter,
  createOpenAIEmbeddingAdapter,
  createPromptRegistry,
  documentAnswerPromptV1,
  resolveProviderConfig,
} from "@doc-pilot/ai";
import { EMBEDDING_DIMENSIONS } from "@doc-pilot/contracts";
import { createAiGenerationRecorder, db } from "@doc-pilot/database";
import { aiMetrics, logger } from "@doc-pilot/observability";
import { apiEnv } from "../env";
import { mockAnswerChunks } from "./mock-answer";

let instance: AIGateway | undefined;

/**
 * API 侧 AI Gateway 单例(ADR-006):问答 streamText 走 Anthropic,
 * 查询向量化走 OpenAI 兼容端点;对应 Key 缺失时回落 Mock(本地/CI 零网络可跑)。
 * mock 问答按注入的检索片段派生出一条有效引用(见 mock-answer.ts),
 * 因此零真实模型也能跑通「回答 + 引用」链路;检索为空时上游直接拒答、不调本函数。
 */
export function apiAIGateway(): AIGateway {
  if (!instance) {
    instance = build();
  }
  return instance;
}

function build(): AIGateway {
  const providers = resolveProviderConfig();
  const { hasAnthropic, hasOpenAI } = providers;
  if (!hasAnthropic) {
    logger.warn("ai.mock_fallback", {
      app: "api",
      capability: "answer",
      missing: "ANTHROPIC_API_KEY 或 AI_GATEWAY_API_KEY",
    });
  }
  if (!hasOpenAI) {
    logger.warn("ai.mock_fallback", {
      app: "api",
      capability: "embedding",
      missing: "OPENAI_API_KEY 或 AI_GATEWAY_API_KEY",
    });
  }

  // ai_generations 落库 + AI 指标(§29.2)一并挂到 recordTrace。
  const recorder = createAiGenerationRecorder(db);

  return createAIGateway({
    routes: {
      answer: {
        provider: hasAnthropic ? "anthropic" : "mock",
        model: apiEnv.ai.answer.model,
        maxTokens: apiEnv.ai.answer.maxTokens,
        // 缺省按 claude-opus-4-8 定价($5/$25 每百万 token)。
        pricing: {
          inputMicrosPerToken: apiEnv.ai.answer.inputMicrosPerToken,
          outputMicrosPerToken: apiEnv.ai.answer.outputMicrosPerToken,
        },
      },
      embedding: {
        provider: hasOpenAI ? "openai" : "mock",
        // 必须与 Worker 侧 embedding 路由一致,查询向量与库内向量才在同一空间。
        model: apiEnv.ai.embedding.model,
        pricing: {
          inputMicrosPerToken: 0,
          outputMicrosPerToken: 0,
          embeddingMicrosPerToken: apiEnv.ai.embedding.embeddingMicrosPerToken,
        },
      },
    },
    adapters: {
      ...(providers.anthropic ? { anthropic: createAnthropicAdapter(providers.anthropic) } : {}),
      ...(providers.openai ? { openai: createOpenAIEmbeddingAdapter(providers.openai) } : {}),
      mock: createMockAdapter({
        embeddingDim: EMBEDDING_DIMENSIONS,
        streamChunks: mockAnswerChunks,
      }),
    },
    prompts: createPromptRegistry([documentAnswerPromptV1]),
    hooks: {
      ...recorder,
      recordTrace: (trace) => {
        aiMetrics.recordTrace(trace);
        return recorder.recordTrace?.(trace);
      },
    },
  });
}
