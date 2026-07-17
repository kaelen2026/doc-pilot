import type { AITrace } from "@doc-pilot/ai";
import { describe, expect, it } from "vitest";
import { toAiGenerationRow } from "./ai-generation";

const baseTrace: AITrace = {
  capability: "summarize",
  promptId: "document-summary",
  promptVersion: "1.0.0",
  provider: "anthropic",
  model: "claude-opus-4-8",
  latencyMs: 1830,
  ok: true,
  usage: {
    provider: "anthropic",
    model: "claude-opus-4-8",
    capability: "summarize",
    inputTokens: 5230,
    outputTokens: 412,
    cacheTokens: 4100,
    embeddingTokens: 0,
    latencyMs: 1830,
    costMicros: 36450,
  },
  metadata: {
    workspaceId: "3f6c1e52-9d1b-4a5e-8f37-2c4f9e0d61aa",
    userId: "b2a90d7e-4c11-4f0e-9a3d-5e8b7c6f1023",
    documentId: "7d5e2f81-06b3-4c9a-b1e4-9a2c3d4e5f60",
    traceId: "trace_01JQX8",
  },
};

describe("toAiGenerationRow", () => {
  it("成功 trace → succeeded 行，token/成本/归因字段齐全", () => {
    const row = toAiGenerationRow(baseTrace);

    expect(row).toMatchObject({
      workspaceId: baseTrace.metadata.workspaceId,
      userId: baseTrace.metadata.userId,
      documentId: baseTrace.metadata.documentId,
      capability: "summarize",
      provider: "anthropic",
      model: "claude-opus-4-8",
      promptId: "document-summary",
      promptVersion: "1.0.0",
      status: "succeeded",
      inputTokens: 5230,
      outputTokens: 412,
      cachedTokens: 4100,
      costMicros: 36450,
      latencyMs: 1830,
      traceId: "trace_01JQX8",
    });
    expect(row.completedAt).toBeInstanceOf(Date);
  });

  it("失败 trace → failed 行，token 列为 null、带 errorCode", () => {
    const row = toAiGenerationRow({
      ...baseTrace,
      ok: false,
      usage: undefined,
      errorCode: "AI_RATE_LIMITED",
    });

    expect(row).toMatchObject({
      status: "failed",
      inputTokens: null,
      outputTokens: null,
      cachedTokens: null,
      costMicros: null,
      errorCode: "AI_RATE_LIMITED",
    });
  });

  it("embedding 调用的 token 计入 input_tokens", () => {
    const row = toAiGenerationRow({
      ...baseTrace,
      capability: "embed-chunk",
      usage: {
        ...(baseTrace.usage ?? ({} as never)),
        capability: "embed-chunk",
        inputTokens: 0,
        outputTokens: 0,
        embeddingTokens: 2048,
        costMicros: 4096,
      },
    });

    expect(row.inputTokens).toBe(2048);
    expect(row.costMicros).toBe(4096);
  });

  it("metadata 没有 traceId 时生成 UUID 兜底（列 NOT NULL）", () => {
    const row = toAiGenerationRow({
      ...baseTrace,
      metadata: { workspaceId: baseTrace.metadata.workspaceId },
    });

    expect(row.traceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.userId).toBeUndefined();
  });
});
