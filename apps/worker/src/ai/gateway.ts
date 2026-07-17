import {
  type AIGateway,
  createAIGateway,
  createAnthropicAdapter,
  createMockAdapter,
  createPromptRegistry,
  documentSummaryPromptV1,
  documentSummarySectionPromptV1,
} from "@doc-pilot/ai";
import { createAiGenerationRecorder, db } from "@doc-pilot/database";

let instance: AIGateway | undefined;

/**
 * Worker 侧 AI Gateway 单例(ADR-006:业务代码只经此调用 AI)。
 * - 有 ANTHROPIC_API_KEY 时走真实 Anthropic Adapter;
 * - 没有时回落 Mock Adapter(本地/CI 零网络跑通全流程,产出占位摘要)。
 * - Usage/Trace 通过 createAiGenerationRecorder 落 ai_generations 表。
 */
export function workerAIGateway(): AIGateway {
  if (!instance) {
    instance = build();
  }
  return instance;
}

function build(): AIGateway {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const provider = hasKey ? "anthropic" : "mock";
  if (!hasKey) {
    console.warn("[worker] ANTHROPIC_API_KEY 未设置,AI Gateway 使用 mock adapter(占位摘要)");
  }

  return createAIGateway({
    routes: {
      summarize: {
        provider,
        model: process.env.AI_SUMMARIZE_MODEL ?? "claude-opus-4-8",
        maxTokens: Number(process.env.AI_SUMMARIZE_MAX_TOKENS ?? 16000),
        // 缺省按 claude-opus-4-8 定价($5/$25 每百万 token);换模型时用环境变量同步调整。
        pricing: {
          inputMicrosPerToken: Number(process.env.AI_SUMMARIZE_INPUT_MICROS ?? 5),
          outputMicrosPerToken: Number(process.env.AI_SUMMARIZE_OUTPUT_MICROS ?? 25),
        },
      },
    },
    adapters: hasKey ? { anthropic: createAnthropicAdapter() } : { mock: devMockAdapter() },
    prompts: createPromptRegistry([documentSummaryPromptV1, documentSummarySectionPromptV1]),
    hooks: createAiGenerationRecorder(db),
  });
}

/** 占位响应同时满足章节摘要与最终摘要两个 Schema(zod 会剥掉多余字段)。 */
function devMockAdapter() {
  return createMockAdapter({
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
