import type { AnthropicAdapterOptions } from "./adapters/anthropic";
import type { OpenAIEmbeddingAdapterOptions } from "./adapters/openai-embedding";

/**
 * 从环境变量解析各 Provider 的凭据与端点(ADR-006:接线层集中做,adapter 保持通用)。
 *
 * 统一网关(如 new-api)只发一个令牌、一个 host,两种兼容协议共用:
 * - `AI_GATEWAY_BASE_URL` —— 网关 host,如 https://new-api.lingowhale.com(不带 /v1)。
 * - `AI_GATEWAY_API_KEY`  —— 网关令牌,文本(Anthropic 格式)与 embedding(OpenAI 格式)共用。
 *
 * 路径差异在这里吸收,让上层无需关心:
 * - 文本走 Anthropic SDK,SDK 自行拼 `/v1/messages`,故 baseURL 直接用 host。
 * - embedding 走 OpenAI 兼容端点,adapter 自行拼 `/embeddings`,故 baseURL 需带 `/v1`。
 *
 * 兼容旧配置:显式 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `*_BASE_URL` 优先于网关配置,
 * 因此原有「分别配官方 Key」的用法不受影响。
 */
export interface ResolvedProviderConfig {
  /** 文本生成(Anthropic 格式)adapter 选项;凭据缺失时 undefined。 */
  anthropic?: Pick<AnthropicAdapterOptions, "apiKey" | "baseURL" | "thinking">;
  /** embedding(OpenAI 兼容)adapter 选项;凭据缺失时 undefined。 */
  openai?: Pick<OpenAIEmbeddingAdapterOptions, "apiKey" | "baseURL" | "timeoutMs">;
  /** 是否具备文本能力凭据(决定路由到 anthropic 还是回落 mock)。 */
  hasAnthropic: boolean;
  /** 是否具备 embedding 能力凭据。 */
  hasOpenAI: boolean;
}

type Env = Record<string, string | undefined>;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export function resolveProviderConfig(env: Env = process.env): ResolvedProviderConfig {
  const gatewayKey = env.AI_GATEWAY_API_KEY;
  const gatewayBase = env.AI_GATEWAY_BASE_URL
    ? trimTrailingSlash(env.AI_GATEWAY_BASE_URL)
    : undefined;

  // 关键:baseURL 只在「该 provider 用网关令牌」时才借网关 host。若显式配了 provider 自己的
  // Key,说明用户要直连官方(或该 Key 对应的端点),此时绝不能把 Key 发去网关。这样才支持
  // 「文本走 new-api + embedding 走官方 OpenAI」这类混搭(本网关无 embedding 模型,正是此场景)。

  // 文本:显式 ANTHROPIC_API_KEY 优先,否则回落网关。网关分支 baseURL 用 host 原样
  // (Anthropic SDK 自拼 /v1/messages);官方分支 baseURL 留空走 SDK 默认。
  const anthropicKey = env.ANTHROPIC_API_KEY ?? gatewayKey;
  const anthropicUsesGateway = !env.ANTHROPIC_API_KEY && Boolean(gatewayKey);
  const anthropicBase = env.ANTHROPIC_BASE_URL ?? (anthropicUsesGateway ? gatewayBase : undefined);
  // 中转网关可能不支持 adaptive thinking 参数;AI_ANTHROPIC_THINKING=none 可关闭以避免报错。
  const thinking = env.AI_ANTHROPIC_THINKING === "none" ? "none" : undefined;

  // embedding:显式 OPENAI_API_KEY 优先,否则回落网关。网关分支 host 需补 /v1 才是
  // OpenAI 兼容根路径(adapter 自拼 /embeddings);官方分支 baseURL 留空走官方默认端点。
  const openaiKey = env.OPENAI_API_KEY ?? gatewayKey;
  const openaiUsesGateway = !env.OPENAI_API_KEY && Boolean(gatewayKey);
  const openaiBase =
    env.OPENAI_BASE_URL ?? (openaiUsesGateway && gatewayBase ? `${gatewayBase}/v1` : undefined);
  const embeddingTimeoutMs = Number(env.AI_EMBEDDING_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(embeddingTimeoutMs) && embeddingTimeoutMs > 0 ? embeddingTimeoutMs : undefined;

  const hasAnthropic = Boolean(anthropicKey);
  // 自托管 embedding 端点(如本地 Ollama)通常免鉴权:显式配了 OPENAI_BASE_URL 即视为具备
  // embedding 能力,即使没有 key(adapter 只对官方 OpenAI 端点强制要求 key)。
  const hasOpenAI = Boolean(openaiKey) || Boolean(openaiBase);

  return {
    hasAnthropic,
    hasOpenAI,
    anthropic: hasAnthropic
      ? { apiKey: anthropicKey, baseURL: anthropicBase, ...(thinking ? { thinking } : {}) }
      : undefined,
    openai: hasOpenAI
      ? { apiKey: openaiKey, baseURL: openaiBase, ...(timeoutMs ? { timeoutMs } : {}) }
      : undefined,
  };
}
