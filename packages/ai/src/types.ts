import type { z } from "zod";

/** 每次 AI 调用必须携带的业务上下文，用于 Usage / Trace 归因（cross-cutting.md#28 聚合维度）。 */
export interface AIMetadata {
  workspaceId: string;
  userId?: string;
  documentId?: string;
  traceId?: string;
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 单次调用的用量与成本。cost_micros 为整数微货币：1 美元 = 1,000,000 micros。 */
export interface AIUsage {
  provider: string;
  model: string;
  capability: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  embeddingTokens: number;
  latencyMs: number;
  costMicros: number;
}

export interface AIResult<T> {
  data: T;
  usage: AIUsage;
}

export interface AIStreamResult {
  textStream: AsyncIterable<string>;
  /** 流结束后 resolve；在此之前 Usage 未知。 */
  usage: Promise<AIUsage>;
}

export interface EmbeddingResult {
  embeddings: number[][];
  usage: AIUsage;
}

/**
 * 所有 AI 调用的唯一入口（ADR-006）。
 * 业务/Worker 代码只依赖这个接口，绝不直接 import Provider SDK。
 */
export interface AIGateway {
  generateObject<T>(input: {
    capability: string;
    promptId: string;
    promptVersion: string;
    schema: z.ZodType<T>;
    variables: Record<string, unknown>;
    metadata: AIMetadata;
  }): Promise<AIResult<T>>;

  streamText(input: {
    capability: string;
    promptId: string;
    promptVersion: string;
    messages: AIMessage[];
    metadata: AIMetadata;
  }): Promise<AIStreamResult>;

  embed(input: {
    capability: string;
    texts: string[];
    metadata: AIMetadata;
  }): Promise<EmbeddingResult>;
}
