import {
  type AIGateway,
  ANSWER_CITATIONS_MARKER,
  createAIGateway,
  createAnthropicAdapter,
  createMockAdapter,
  createOpenAIEmbeddingAdapter,
  createPromptRegistry,
  documentAnswerPromptV1,
  resolveProviderConfig,
} from "@doc-pilot/ai";
import { EMBEDDING_DIMENSIONS } from "@doc-pilot/contracts";
import { evalEnv } from "./env";
import { judgePromptV1 } from "./judge";

export type EvalMode = "retrieval" | "full";

/**
 * Eval 专用 Gateway。与线上同一套 document-answer Prompt 与路由约定,
 * 评的就是发布件本身;区别只在 usage 不落库(评测流量不进 ai_generations)。
 * - retrieval 模式:embedding 走 mock(确定性哈希向量),零网络,CI 可跑。
 * - full 模式:强制要求真实 Key,拒绝静默回落 mock 产出无意义分数。
 */
export function evalGateway(mode: EvalMode): AIGateway {
  const providers = resolveProviderConfig();
  const { hasAnthropic, hasOpenAI } = providers;
  if (mode === "full" && (!hasAnthropic || !hasOpenAI)) {
    throw new Error(
      "EVAL_MODE=full 需要文本与 embedding 凭据(ANTHROPIC_API_KEY/OPENAI_API_KEY 或 AI_GATEWAY_API_KEY;评测不允许 mock 兜底)",
    );
  }

  const embeddingProvider = hasOpenAI ? "openai" : "mock";
  const textProvider = mode === "full" ? "anthropic" : "mock";

  return createAIGateway({
    routes: {
      embedding: {
        provider: embeddingProvider,
        model: evalEnv.ai.embeddingModel,
      },
      answer: {
        provider: textProvider,
        model: evalEnv.ai.answerModel,
        maxTokens: 8000,
      },
      judge: {
        provider: textProvider,
        // Judge 与被评模型解耦,缺省同型号;换 judge 模型不影响被评链路。
        model: evalEnv.ai.judgeModel,
        maxTokens: 4000,
      },
    },
    adapters: {
      ...(providers.anthropic ? { anthropic: createAnthropicAdapter(providers.anthropic) } : {}),
      ...(providers.openai ? { openai: createOpenAIEmbeddingAdapter(providers.openai) } : {}),
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
