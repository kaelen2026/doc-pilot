import type { AIMessage } from "./types";

/** Adapter 返回的原始用量；成本换算由 Gateway 按路由定价统一完成。 */
export interface AdapterUsage {
  inputTokens: number;
  outputTokens: number;
  cacheTokens?: number;
  embeddingTokens?: number;
}

/**
 * Provider 适配器：Gateway 与具体 SDK 之间的唯一边界（ADR-006）。
 * 实现方应把可识别的 Provider 错误直接抛成 AIError（如 429 → AI_RATE_LIMITED）；
 * 未标准化的错误由 Gateway 的 normalizeAIError 兜底。
 */
export interface ProviderAdapter {
  readonly provider: string;

  generateText(input: {
    model: string;
    system: string;
    messages: AIMessage[];
    maxTokens?: number;
  }): Promise<{ text: string; usage: AdapterUsage }>;

  streamText(input: {
    model: string;
    system: string;
    messages: AIMessage[];
    maxTokens?: number;
  }): Promise<{ textStream: AsyncIterable<string>; usage: Promise<AdapterUsage> }>;

  embed(input: {
    model: string;
    texts: string[];
  }): Promise<{ embeddings: number[][]; usage: AdapterUsage }>;
}
