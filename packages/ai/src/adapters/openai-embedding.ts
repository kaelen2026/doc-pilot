import type { AdapterUsage, ProviderAdapter } from "../adapter";
import { AIError } from "../errors";

export interface OpenAIEmbeddingAdapterOptions {
  /** 由接线层注入；自托管端点(Ollama 等)可不设。 */
  apiKey?: string;
  /**
   * OpenAI 兼容端点,缺省官方端点。由 resolveProviderConfig 从 OPENAI_BASE_URL / 网关 host 注入。
   * 本地 Ollama 填 http://localhost:11434/v1;可指向任何兼容网关。
   */
  baseURL?: string;
  timeoutMs?: number;
  /** 测试注入用。 */
  fetchFn?: typeof fetch;
}

const OPENAI_OFFICIAL_BASE_URL = "https://api.openai.com/v1";

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
  const apiKey = options.apiKey;
  const baseURL = (options.baseURL ?? OPENAI_OFFICIAL_BASE_URL).replace(/\/$/, "");
  // 仅官方 OpenAI 端点强制要求 API Key;自托管端点(Ollama 等)通常免鉴权。
  const requiresApiKey = baseURL === OPENAI_OFFICIAL_BASE_URL;
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
      if (requiresApiKey && !apiKey) {
        throw new Error(
          "OPENAI_API_KEY 未设置,无法调用官方 OpenAI embedding API(自托管端点请设 OPENAI_BASE_URL)",
        );
      }
      const headers: Record<string, string> = { "content-type": "application/json" };
      // 自托管端点可能免鉴权;有 key 就带上(Ollama 会忽略)。
      if (apiKey) {
        headers.authorization = `Bearer ${apiKey}`;
      }
      let response: Response;
      try {
        response = await fetchFn(`${baseURL}/embeddings`, {
          method: "POST",
          headers,
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
