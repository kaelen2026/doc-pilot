import { db } from "@doc-pilot/database";
import { aiGenerations, documents, messages } from "@doc-pilot/database/schema";
import { and, eq, gte, isNull, sql } from "drizzle-orm";

/**
 * 配额是跨模块的只读聚合:存储/文档数取自 documents,月度提问取自 messages,
 * 月度 Token 取自 ai_generations。所有查询按 workspaceId 过滤(租户隔离,ADR-008)。
 */

/** 未删除文档占用的存储字节合计。 */
export async function sumStorageBytes(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)` })
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), isNull(documents.deletedAt)));
  return Number(row?.total ?? 0);
}

/** 未删除文档数量。 */
export async function countDocuments(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), isNull(documents.deletedAt)));
  return Number(row?.total ?? 0);
}

/** since 起(含)的提问次数 = user 角色消息数。 */
export async function countMonthlyQuestions(workspaceId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(
        eq(messages.workspaceId, workspaceId),
        eq(messages.role, "user"),
        gte(messages.createdAt, since),
      ),
    );
  return Number(row?.total ?? 0);
}

/** since 起(含)的 AI Token 合计(input + output,跨全部能力)。 */
export async function sumMonthlyAiTokens(workspaceId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(coalesce(${aiGenerations.inputTokens}, 0) + coalesce(${aiGenerations.outputTokens}, 0)), 0)`,
    })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, workspaceId), gte(aiGenerations.createdAt, since)));
  return Number(row?.total ?? 0);
}
