import { randomUUID } from "node:crypto";
import type { AIGatewayHooks, AITrace } from "@doc-pilot/ai";
import type { Database } from "./client";
import { aiGenerations } from "./schema/ai-generation";

export type AiGenerationRow = typeof aiGenerations.$inferInsert;

/**
 * AITrace → ai_generations 行的纯映射，便于单测。
 * embedding 调用的 token 计入 input_tokens（表结构无独立 embedding 列，
 * 语义上 embedding 输入就是输入 token；见 data-model.md §8.9）。
 */
export function toAiGenerationRow(trace: AITrace): AiGenerationRow {
  const usage = trace.usage;
  const completedAt = new Date();
  return {
    workspaceId: trace.metadata.workspaceId,
    userId: trace.metadata.userId,
    documentId: trace.metadata.documentId,
    capability: trace.capability,
    provider: trace.provider,
    model: trace.model,
    promptId: trace.promptId,
    promptVersion: trace.promptVersion,
    status: trace.ok ? "succeeded" : "failed",
    inputTokens: usage ? usage.inputTokens + usage.embeddingTokens : null,
    outputTokens: usage?.outputTokens ?? null,
    cachedTokens: usage?.cacheTokens ?? null,
    costMicros: usage?.costMicros ?? null,
    latencyMs: trace.latencyMs,
    traceId: trace.metadata.traceId ?? randomUUID(),
    errorCode: trace.errorCode,
    completedAt,
  };
}

/**
 * 把 Gateway 的 recordTrace 钩子接到 ai_generations 表。
 * 成功与失败都落一行（trace 携带 usage 时补全 token/成本），
 * 记录失败由 Gateway 吞掉并打日志，不反噬业务调用。
 */
export function createAiGenerationRecorder(db: Database): AIGatewayHooks {
  return {
    async recordTrace(trace) {
      await db.insert(aiGenerations).values(toAiGenerationRow(trace));
    },
  };
}
