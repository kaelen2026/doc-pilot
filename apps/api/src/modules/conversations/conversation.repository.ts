import type { ValidatedCitation } from "@doc-pilot/ai";
import { db } from "@doc-pilot/database";
import { citations, conversations, documents, messages } from "@doc-pilot/database/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type CitationRow = typeof citations.$inferSelect;

/** 会话绑定文档的问答前置信息(状态门禁 + 版本过滤都取自这里)。 */
export interface AskableDocument {
  id: string;
  workspaceId: string;
  status: string;
  processingVersion: number;
}

export async function loadDocument(params: {
  workspaceId: string;
  documentId: string;
}): Promise<AskableDocument | null> {
  const [doc] = await db
    .select({
      id: documents.id,
      workspaceId: documents.workspaceId,
      status: documents.status,
      processingVersion: documents.processingVersion,
    })
    .from(documents)
    // 租户过滤在查询里完成(ADR-008),不信任请求参数。
    .where(
      and(
        eq(documents.id, params.documentId),
        eq(documents.workspaceId, params.workspaceId),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return doc ?? null;
}

export async function createConversation(params: {
  workspaceId: string;
  documentId: string;
  userId: string;
  title: string | null;
}): Promise<ConversationRow> {
  const [row] = await db
    .insert(conversations)
    .values({
      workspaceId: params.workspaceId,
      documentId: params.documentId,
      userId: params.userId,
      title: params.title,
    })
    .returning();
  if (!row) {
    throw new Error("insert conversations 未返回行");
  }
  return row;
}

export async function listConversations(params: {
  workspaceId: string;
  documentId?: string;
}): Promise<ConversationRow[]> {
  const filters = [
    eq(conversations.workspaceId, params.workspaceId),
    isNull(conversations.deletedAt),
  ];
  if (params.documentId) {
    filters.push(eq(conversations.documentId, params.documentId));
  }
  return db
    .select()
    .from(conversations)
    .where(and(...filters))
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversation(params: {
  workspaceId: string;
  conversationId: string;
}): Promise<ConversationRow | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, params.conversationId),
        eq(conversations.workspaceId, params.workspaceId),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * 会话内最近 limit 条消息(升序返回)。取「最近窗口」而非整段历史:
 * 先按 created_at 降序取 limit+1 条(多取 1 条判定 hasMore),再整体反转成升序。
 * 反转后同一事务写入的 user/assistant 对(created_at 相同)恢复「提问先于回答」。
 * 窗口始终是完整历史的后缀,故新消息进入或 limit 递增都不产生空洞/重复。
 */
export async function listMessagesPage(params: {
  conversationId: string;
  limit: number;
}): Promise<{ messages: MessageRow[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.conversationId))
    // 降序取窗口:同刻内 role 升序('assistant' < 'user'),反转后即 user 先于 assistant。
    .orderBy(desc(messages.createdAt), asc(messages.role))
    .limit(params.limit + 1);
  const hasMore = rows.length > params.limit;
  const page = (hasMore ? rows.slice(0, params.limit) : rows).reverse();
  return { messages: page, hasMore };
}

export async function listCitationsByMessageIds(messageIds: string[]): Promise<CitationRow[]> {
  if (messageIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(citations)
    .where(inArray(citations.messageId, messageIds))
    .orderBy(asc(citations.position));
}

/** 幂等查询(rag.md §23.3):按 client_request_id 找已存在的提问及其配对回复。 */
export async function findQuestionPair(params: {
  conversationId: string;
  clientRequestId: string;
}): Promise<{ userMessage: MessageRow; assistantMessage: MessageRow | null } | null> {
  const [userMessage] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, params.conversationId),
        eq(messages.clientRequestId, params.clientRequestId),
      ),
    )
    .limit(1);
  if (!userMessage) {
    return null;
  }
  const [assistantMessage] = await db
    .select()
    .from(messages)
    .where(eq(messages.parentMessageId, userMessage.id))
    .limit(1);
  return { userMessage, assistantMessage: assistantMessage ?? null };
}

/**
 * 原子写入提问对:user 消息 + assistant(pending) 占位,并推进会话 updated_at。
 * 并发重复提交撞 UNIQUE(conversation_id, client_request_id) 时返回 null,
 * 调用方回到 findQuestionPair 走幂等路径。
 */
export async function insertQuestionPair(params: {
  conversationId: string;
  workspaceId: string;
  content: string;
  clientRequestId: string;
}): Promise<{ userMessage: MessageRow; assistantMessage: MessageRow } | null> {
  try {
    return await db.transaction(async (tx) => {
      const [userMessage] = await tx
        .insert(messages)
        .values({
          conversationId: params.conversationId,
          workspaceId: params.workspaceId,
          role: "user",
          content: params.content,
          status: "completed",
          clientRequestId: params.clientRequestId,
        })
        .returning();
      if (!userMessage) {
        throw new Error("insert messages(user) 未返回行");
      }
      const [assistantMessage] = await tx
        .insert(messages)
        .values({
          conversationId: params.conversationId,
          workspaceId: params.workspaceId,
          role: "assistant",
          content: "",
          status: "pending",
          parentMessageId: userMessage.id,
        })
        .returning();
      if (!assistantMessage) {
        throw new Error("insert messages(assistant) 未返回行");
      }
      await tx
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, params.conversationId));
      return { userMessage, assistantMessage };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return null;
    }
    throw err;
  }
}

/** failed → 允许显式重试(rag.md §23.3):把回复复位为 pending 再重新生成。 */
export async function resetAssistantForRetry(assistantMessageId: string): Promise<void> {
  await db
    .update(messages)
    .set({ status: "pending", content: "", errorCode: null })
    .where(eq(messages.id, assistantMessageId));
}

/** 引用全部通过校验后,答案与 citations 在同一事务落库(ADR-007)。 */
export async function completeAssistant(params: {
  assistantMessageId: string;
  content: string;
  validatedCitations: ValidatedCitation[];
}): Promise<CitationRow[]> {
  return db.transaction(async (tx) => {
    await tx
      .update(messages)
      .set({ status: "completed", content: params.content, errorCode: null })
      .where(eq(messages.id, params.assistantMessageId));
    if (params.validatedCitations.length === 0) {
      return [];
    }
    return tx
      .insert(citations)
      .values(
        params.validatedCitations.map((c) => ({
          messageId: params.assistantMessageId,
          documentId: c.documentId,
          documentChunkId: c.chunkId,
          quote: c.quote,
          claim: c.claim,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          score: c.matchScore.toFixed(6),
          position: c.index,
        })),
      )
      .returning();
  });
}

export async function failAssistant(params: {
  assistantMessageId: string;
  errorCode: string;
}): Promise<void> {
  await db
    .update(messages)
    .set({ status: "failed", errorCode: params.errorCode })
    .where(eq(messages.id, params.assistantMessageId));
}

/** postgres.js 的唯一约束冲突(SQLSTATE 23505)。 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/** 会话历史里已完成的消息(检索上下文构建用),不含当前提问。 */
export async function listCompletedMessagesBefore(params: {
  conversationId: string;
  beforeMessageId: string;
}): Promise<MessageRow[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(eq(messages.conversationId, params.conversationId), eq(messages.status, "completed")),
    )
    .orderBy(asc(messages.createdAt), desc(messages.role));
  const cutoff = rows.findIndex((m) => m.id === params.beforeMessageId);
  return cutoff >= 0 ? rows.slice(0, cutoff) : rows;
}
