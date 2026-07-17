import { AIError, type AIGateway } from "@doc-pilot/ai";
import { EMBEDDING_DIMENSIONS, PROCESSING_ERROR_CODES } from "@doc-pilot/contracts";
import { describe, expect, it } from "vitest";
import { embedChunks } from "./embed";
import { PipelineError } from "./errors";
import type { Chunk } from "./types";

function chunkOf(index: number): Chunk {
  return {
    chunkIndex: index,
    content: `chunk ${index}`,
    contentHash: `hash-${index}`,
    tokenCount: 10,
    pageStart: 1,
    pageEnd: 1,
    sectionPath: [],
    metadata: { parserVersion: "pdf-v1", chunkerVersion: "semantic-v1" },
  };
}

function gatewayStub(embed: (texts: string[]) => Promise<{ embeddings: number[][] }>): {
  gateway: AIGateway;
  calls: string[][];
} {
  const calls: string[][] = [];
  const gateway = {
    async embed(input: { texts: string[] }) {
      calls.push(input.texts);
      const { embeddings } = await embed(input.texts);
      return {
        embeddings,
        usage: {
          provider: "mock",
          model: "test-embedding",
          capability: "embedding",
          inputTokens: 0,
          outputTokens: 0,
          cacheTokens: 0,
          embeddingTokens: 1,
          latencyMs: 1,
          costMicros: 0,
        },
      };
    },
  } as unknown as AIGateway;
  return { gateway, calls };
}

const metadata = { workspaceId: "ws-1", documentId: "doc-1" };

describe("embedChunks", () => {
  it("分批调用并保持向量与 chunk 对齐", async () => {
    const { gateway, calls } = gatewayStub(async (texts) => ({
      embeddings: texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0.5)),
    }));
    const chunks = Array.from({ length: 70 }, (_, i) => chunkOf(i));

    const result = await embedChunks({ gateway, chunks, metadata });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveLength(64);
    expect(calls[1]).toHaveLength(6);
    expect(result.vectors).toHaveLength(70);
    expect(result.model).toBe("test-embedding");
  });

  it("维度不符 → 不可重试的 INVALID_CONFIGURATION", async () => {
    const { gateway } = gatewayStub(async (texts) => ({
      embeddings: texts.map(() => [0.1, 0.2]),
    }));

    const err = await embedChunks({ gateway, chunks: [chunkOf(0)], metadata }).catch((e) => e);
    expect(err).toBeInstanceOf(PipelineError);
    expect(err.code).toBe(PROCESSING_ERROR_CODES.INVALID_CONFIGURATION);
    expect(err.retryable).toBe(false);
  });

  it("瞬时 AI 错误可重试,配额类不可重试", async () => {
    const rateLimited = gatewayStub(async () => {
      throw new AIError("AI_RATE_LIMITED", "限流");
    });
    const transient = await embedChunks({
      gateway: rateLimited.gateway,
      chunks: [chunkOf(0)],
      metadata,
    }).catch((e) => e);
    expect(transient).toBeInstanceOf(PipelineError);
    expect(transient.retryable).toBe(true);

    const quota = gatewayStub(async () => {
      throw new AIError("AI_QUOTA_EXCEEDED", "配额用尽");
    });
    const fatal = await embedChunks({
      gateway: quota.gateway,
      chunks: [chunkOf(0)],
      metadata,
    }).catch((e) => e);
    expect(fatal).toBeInstanceOf(PipelineError);
    expect(fatal.code).toBe(PROCESSING_ERROR_CODES.EMBEDDING_FAILED);
    expect(fatal.retryable).toBe(false);
  });

  it("空 chunk 列表直接返回空向量", async () => {
    const { gateway, calls } = gatewayStub(async () => ({ embeddings: [] }));
    const result = await embedChunks({ gateway, chunks: [], metadata });
    expect(calls).toHaveLength(0);
    expect(result.vectors).toEqual([]);
  });
});
