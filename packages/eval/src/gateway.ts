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
import { judgePromptV1 } from "./judge";

export type EvalMode = "retrieval" | "full";

/**
 * Eval 专用 Gateway。与线上同一套 document-answer Prompt 与路由约定,
 * 评的就是发布件本身;区别只在 usage 不落库(评测流量不进 ai_generations)。
 * - retrieval 模式:embedding 走 mock(确定性哈希向量),零网络,CI 可跑。
 * - full 模式:强制要求真实 Key,拒绝静默回落 mock 产出无意义分数。
 */
export function evalGateway(mode: EvalMode): AIGateway {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (mode === "full" && (!hasAnthropic || !hasOpenAI)) {
    throw new Error(
      "EVAL_MODE=full 需要 ANTHROPIC_API_KEY 与 OPENAI_API_KEY(评测不允许 mock 兜底)",
    );
  }

  const embeddingProvider = hasOpenAI ? "openai" : "mock";
  const textProvider = mode === "full" ? "anthropic" : "mock";

  return createAIGateway({
    routes: {
      embedding: {
        provider: embeddingProvider,
        model: process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      },
      answer: {
        provider: textProvider,
        model: process.env.AI_ANSWER_MODEL ?? "claude-opus-4-8",
        maxTokens: 8000,
      },
      judge: {
        provider: textProvider,
        // Judge 与被评模型解耦,缺省同型号;换 judge 模型不影响被评链路。
        model: process.env.AI_JUDGE_MODEL ?? "claude-opus-4-8",
        maxTokens: 4000,
      },
    },
    adapters: {
      ...(hasAnthropic ? { anthropic: createAnthropicAdapter() } : {}),
      ...(hasOpenAI ? { openai: createOpenAIEmbeddingAdapter() } : {}),
      mock: createMockAdapter({
        embeddingDim: EMBEDDING_DIMENSIONS,
        streamChunks: [
          "mock 模式占位拒答。",
          `\n${ANSWER_CITATIONS_MARKER}\n`,
          '{"insufficientEvidence": true, "citations": []}',
        ],
      }),
    },
    prompts: createPromptRegistry([documentAnswerPromptV1, judgePromptV1]),
  });
}
