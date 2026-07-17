import type { AdapterUsage, ProviderAdapter } from "../adapter";
import type { AIError } from "../errors";

export interface MockAdapterOptions {
  /** generateText 的返回对象（会被 JSON 序列化）；传函数可按输入定制。 */
  objectResponse?: unknown | ((input: { system: string }) => unknown);
  /** streamText 逐段吐出的文本。 */
  streamChunks?: string[];
  /** 向量维度，默认 8（真实维度由集成 PR 按所选 embedding 模型决定）。 */
  embeddingDim?: number;
  /** 让所有调用抛出指定错误，用于测试错误标准化链路。 */
  failWith?: AIError | Error;
}

/**
 * 测试与本地开发用 Mock Provider：无网络、确定性输出。
 * embedding 由文本内容哈希生成，同文本恒同向量，便于断言幂等。
 */
export function createMockAdapter(options: MockAdapterOptions = {}): ProviderAdapter {
  const dim = options.embeddingDim ?? 8;

  function maybeFail(): void {
    if (options.failWith) {
      throw options.failWith;
    }
  }

  function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  return {
    provider: "mock",

    async generateText(input) {
      maybeFail();
      const body =
        typeof options.objectResponse === "function"
          ? (options.objectResponse as (i: { system: string }) => unknown)({ system: input.system })
          : (options.objectResponse ?? { ok: true });
      const text = JSON.stringify(body);
      const inputText = input.system + input.messages.map((m) => m.content).join("");
      const usage: AdapterUsage = {
        inputTokens: estimateTokens(inputText),
        outputTokens: estimateTokens(text),
      };
      return { text, usage };
    },

    async streamText(input) {
      maybeFail();
      const chunks = options.streamChunks ?? ["mock ", "stream ", "output"];
      const inputText = input.system + input.messages.map((m) => m.content).join("");
      const usage: AdapterUsage = {
        inputTokens: estimateTokens(inputText),
        outputTokens: estimateTokens(chunks.join("")),
      };
      async function* stream(): AsyncIterable<string> {
        for (const chunk of chunks) {
          yield chunk;
        }
      }
      return { textStream: stream(), usage: Promise.resolve(usage) };
    },

    async embed(input) {
      maybeFail();
      const embeddings = input.texts.map((text) => deterministicVector(text, dim));
      const usage: AdapterUsage = {
        inputTokens: 0,
        outputTokens: 0,
        embeddingTokens: input.texts.reduce((sum, t) => sum + estimateTokens(t), 0),
      };
      return { embeddings, usage };
    },
  };
}

/** FNV-1a 变体：把文本散列成 [-1, 1] 区间的定长向量。 */
function deterministicVector(text: string, dim: number): number[] {
  const vector = new Array<number>(dim).fill(0);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    const slot = i % dim;
    vector[slot] = (vector[slot] ?? 0) + (hash % 1000) / 1000;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}
