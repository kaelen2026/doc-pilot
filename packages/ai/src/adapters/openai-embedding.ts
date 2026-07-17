import type { AdapterUsage, ProviderAdapter } from "../adapter";
import { AIError } from "../errors";

export interface OpenAIEmbeddingAdapterOptions {
  /** 缺省读 OPENAI_API_KEY。 */
  apiKey?: string;
  /** OpenAI 兼容端点,缺省 https://api.openai.com/v1;可指向任何兼容网关。 */
  baseURL?: string;
  timeoutMs?: number;
  /** 测试注入用。 */
  fetchFn?: typeof fetch;
}

interface EmbeddingsResponse {
  data: Array<{ index: number; embedding: number[] }>;
  usage?: { prompt_tokens?: number };
}

/**
 * OpenAI 兼容的 Embedding Adapter(Anthropic 不提供 embedding API,embed 能力路由到这里)。
 * 只实现 embed;文本生成能力路由到本 provider 属于接线错误,直接抛普通 Error。
 * 用 fetch 直调 /v1/embeddings,不引入 openai SDK 依赖。
 */
export function createOpenAIEmbeddingAdapter(
  options: OpenAIEmbeddingAdapterOptions = {},
): ProviderAdapter {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const baseURL = (options.baseURL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fetchFn = options.fetchFn ?? fetch;

  return {
    provider: "openai",

    async generateText() {
      throw new Error("openai adapter 仅支持 embed,文本生成请路由到其他 provider");
    },

    async streamText() {
      throw new Error("openai adapter 仅支持 embed,文本生成请路由到其他 provider");
    },

    async embed(input) {
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY 未设置,无法调用 embedding API");
      }
      let response: Response;
      try {
        response = await fetchFn(`${baseURL}/embeddings`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: input.model, input: input.texts }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new AIError("AI_TIMEOUT", `embedding 请求超时(${timeoutMs}ms)`, { cause: err });
        }
        throw new AIError("AI_PROVIDER_UNAVAILABLE", "embedding 请求网络失败", { cause: err });
      }

      if (!response.ok) {
        throw await toAIError(response);
      }

      const body = (await response.json()) as EmbeddingsResponse;
      if (!Array.isArray(body.data) || body.data.length !== input.texts.length) {
        throw new AIError(
          "AI_INVALID_RESPONSE",
          `embedding 返回数量不符:期望 ${input.texts.length},实际 ${body.data?.length ?? 0}`,
        );
      }
      // 按 index 归位,不依赖返回顺序。
      const embeddings = new Array<number[]>(input.texts.length);
      for (const item of body.data) {
        embeddings[item.index] = item.embedding;
      }
      const usage: AdapterUsage = {
        inputTokens: 0,
        outputTokens: 0,
        embeddingTokens: body.usage?.prompt_tokens ?? 0,
      };
      return { embeddings, usage };
    },
  };
}

/** HTTP 状态 → AI_*(ADR-006 错误标准化)。 */
async function toAIError(response: Response): Promise<AIError> {
  const text = await response.text().catch(() => "");
  const message = `embedding API ${response.status}:${text.slice(0, 500)}`;
  if (response.status === 429) {
    return new AIError("AI_RATE_LIMITED", message);
  }
  if (response.status === 413 || (response.status === 400 && /token|too long/i.test(text))) {
    return new AIError("AI_CONTEXT_TOO_LARGE", message);
  }
  return new AIError("AI_PROVIDER_UNAVAILABLE", message);
}
