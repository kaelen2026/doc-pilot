import Anthropic from "@anthropic-ai/sdk";
import type { AdapterUsage, ProviderAdapter } from "../adapter";
import { AIError } from "../errors";
import type { AIMessage } from "../types";

export interface AnthropicAdapterOptions {
  /** 缺省走 SDK 的环境解析（ANTHROPIC_API_KEY 等）。 */
  apiKey?: string;
  baseURL?: string;
  maxRetries?: number;
  /** 路由未指定 maxTokens 时的输出上限（含思考 token）。全程流式请求，可以给足余量。 */
  defaultMaxTokens?: number;
  /** adaptive（缺省，模型按任务复杂度自主思考）或 none（省略 thinking 参数）。 */
  thinking?: "adaptive" | "none";
  /** 测试注入用。 */
  client?: Anthropic;
}

/**
 * Anthropic Provider Adapter。
 * - generateText / streamText 均走流式（大输入不吃 HTTP 超时），generateText 内部聚合。
 * - SDK typed error 映射到 AI_* 码；安全分类器拒答（stop_reason=refusal）映射 AI_CONTENT_BLOCKED。
 * - Anthropic 不提供 embedding API：embed 能力请路由到其他 provider（Phase 6 引入）。
 */
export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}): ProviderAdapter {
  const client =
    options.client ??
    new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      maxRetries: options.maxRetries,
    });
  const defaultMaxTokens = options.defaultMaxTokens ?? 64000;
  const thinking =
    (options.thinking ?? "adaptive") === "adaptive" ? ({ type: "adaptive" } as const) : undefined;

  function buildParams(input: {
    model: string;
    system: string;
    messages: AIMessage[];
    maxTokens?: number;
  }) {
    return {
      model: input.model,
      max_tokens: input.maxTokens ?? defaultMaxTokens,
      system: input.system,
      // Anthropic messages 只接受 user/assistant；system 级内容一律走 system 参数
      messages: input.messages.flatMap((m) =>
        m.role === "system" ? [] : [{ role: m.role, content: m.content }],
      ),
      ...(thinking ? { thinking } : {}),
    };
  }

  return {
    provider: "anthropic",

    async generateText(input) {
      try {
        const stream = client.messages.stream(buildParams(input));
        const message = await stream.finalMessage();
        assertNotTruncatedOrRefused(message);
        return { text: textOf(message), usage: mapUsage(message.usage) };
      } catch (err) {
        throw toAIError(err);
      }
    },

    async streamText(input) {
      try {
        const stream = client.messages.stream(buildParams(input));
        const textStream = (async function* () {
          try {
            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                yield event.delta.text;
              }
            }
          } catch (err) {
            throw toAIError(err);
          }
        })();
        const usage = stream.finalMessage().then(
          (message) => {
            assertNotTruncatedOrRefused(message);
            return mapUsage(message.usage);
          },
          (err) => {
            throw toAIError(err);
          },
        );
        return { textStream, usage };
      } catch (err) {
        throw toAIError(err);
      }
    },

    async embed() {
      // 接线错误而非运行时 AI 故障：embed 能力必须路由到提供 embedding API 的 provider。
      throw new Error("Anthropic 不提供 embedding API，embed 能力请路由到其他 provider");
    },
  };
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function mapUsage(usage: Anthropic.Usage): AdapterUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheTokens: (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
  };
}

function assertNotTruncatedOrRefused(message: Anthropic.Message): void {
  if (message.stop_reason === "refusal") {
    throw new AIError("AI_CONTENT_BLOCKED", "模型拒绝了该请求（安全分类器）");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AIError("AI_INVALID_RESPONSE", "输出被 max_tokens 截断，请提高路由的 maxTokens");
  }
}

/** SDK typed error → AI_*（ADR-006 错误标准化）。已是 AIError 的原样透传。 */
function toAIError(err: unknown): AIError {
  if (err instanceof AIError) {
    return err;
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AIError("AI_RATE_LIMITED", err.message, { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AIError("AI_TIMEOUT", err.message, { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    const status = "status" in err ? (err.status as number | undefined) : undefined;
    if (
      status === 413 ||
      (status === 400 && /prompt is too long|too many tokens/i.test(err.message))
    ) {
      return new AIError("AI_CONTEXT_TOO_LARGE", err.message, { cause: err });
    }
    // 5xx / 529 过载 / 网络错误 / 其余 4xx 一律视为 Provider 不可用，业务层只做重试或降级。
    return new AIError("AI_PROVIDER_UNAVAILABLE", err.message, { cause: err });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AIError("AI_PROVIDER_UNAVAILABLE", message, { cause: err });
}
