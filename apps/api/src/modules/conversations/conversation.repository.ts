import type { AIGateway, AIMetadata, ValidatedCitation } from "@doc-pilot/ai";
import { RETRIEVAL } from "@doc-pilot/contracts";
import { db } from "@doc-pilot/database";
import {
  citations,
  conversations,
  documentChunks,
  documents,
  messages,
} from "@doc-pilot/database/schema";
import { withSpan } from "@doc-pilot/observability";
import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { NotFoundError } from "../../shared/errors";
import type { ChunkCandidate } from "./retrieval";

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

/**
 * 租户作用域的 conversations 域数据访问(ADR-008)。
 *
 * 入口拿到已鉴权的 workspaceId 后构造一次,之后所有查询自动注入 `workspace_id` 过滤——
 * 租户边界藏在这个 seam 背后,调用方签名里不再散落 workspaceId,新增方法也漏不掉。
 * 这取代了原先「入口校一次会话、之后按 conversationId/messageId 信任」的聚合根信任模式:
 * 那种模式下租户安全依赖调用顺序,任何直接按 messageId 操作的新入口都可能越权。
 *
 * - 读(SELECT):命中 0 行自然返回空/null,查不到即不泄露。
 * - 写(UPDATE):命中 0 行抛 NotFoundError(fail-loud)。正常流程里消息必属本租户,
 *   0 行只可能是越权或数据异常。
 * - citations 表无 workspace_id 列,经 innerJoin messages 继承租户边界。
 */
export function scopedConversationRepo(workspaceId: string) {
  return {
    async loadDocument(params: { documentId: string }): Promise<AskableDocument | null> {
      const [doc] = await db
        .select({
          id: documents.id,
          workspaceId: documents.workspaceId,
          status: documents.status,
          processingVersion: documents.processingVersion,
        })
        .from(documents)
        .where(
          and(
            eq(documents.id, params.documentId),
            eq(documents.workspaceId, workspaceId),
            isNull(documents.deletedAt),
          ),
        )
        .limit(1);
      return doc ?? null;
    },

    async createConversation(params: {
      documentId: string;
      userId: string;
      title: string | null;
    }): Promise<ConversationRow> {
      const [row] = await db
        .insert(conversations)
        .values({
          workspaceId,
          documentId: params.documentId,
          userId: params.userId,
          title: params.title,
        })
        .returning();
      if (!row) {
        throw new Error("insert conversations 未返回行");
      }
      return row;
    },

    async listConversations(params: { documentId?: string }): Promise<ConversationRow[]> {
      const filters = [eq(conversations.workspaceId, workspaceId), isNull(conversations.deletedAt)];
      if (params.documentId) {
        filters.push(eq(conversations.documentId, params.documentId));
      }
      return db
        .select()
        .from(conversations)
        .where(and(...filters))
        .orderBy(desc(conversations.updatedAt));
    },

    async getConversation(params: { conversationId: string }): Promise<ConversationRow | null> {
      const [row] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, params.conversationId),
            eq(conversations.workspaceId, workspaceId),
            isNull(conversations.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    /**
     * 会话内最近 limit 条消息(升序返回)。取「最近窗口」而非整段历史:
     * 先按 created_at 降序取 limit+1 条(多取 1 条判定 hasMore),再整体反转成升序。
     * 反转后同一事务写入的 user/assistant 对(created_at 相同)恢复「提问先于回答」。
     * 窗口始终是完整历史的后缀,故新消息进入或 limit 递增都不产生空洞/重复。
     */
    async listMessagesPage(params: {
      conversationId: string;
      limit: number;
    }): Promise<{ messages: MessageRow[]; hasMore: boolean }> {
      const rows = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, params.conversationId),
            eq(messages.workspaceId, workspaceId),
          ),
        )
        // 降序取窗口:同刻内 role 升序('assistant' < 'user'),反转后即 user 先于 assistant。
        .orderBy(desc(messages.createdAt), asc(messages.role))
        .limit(params.limit + 1);
      const hasMore = rows.length > params.limit;
      const page = (hasMore ? rows.slice(0, params.limit) : rows).reverse();
      return { messages: page, hasMore };
    },

    async listCitationsByMessageIds(messageIds: string[]): Promise<CitationRow[]> {
      if (messageIds.length === 0) {
        return [];
      }
      // citations 无 workspace_id 列,经 messages 继承租户边界(join 上 workspace_id)。
      return db
        .select(getTableColumns(citations))
        .from(citations)
        .innerJoin(messages, eq(messages.id, citations.messageId))
        .where(and(inArray(citations.messageId, messageIds), eq(messages.workspaceId, workspaceId)))
        .orderBy(asc(citations.position));
    },

    /** 幂等查询(rag.md §23.3):按 client_request_id 找已存在的提问及其配对回复。 */
    async findQuestionPair(params: {
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
            eq(messages.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!userMessage) {
        return null;
      }
      const [assistantMessage] = await db
        .select()
        .from(messages)
        .where(
          and(eq(messages.parentMessageId, userMessage.id), eq(messages.workspaceId, workspaceId)),
        )
        .limit(1);
      return { userMessage, assistantMessage: assistantMessage ?? null };
    },

    /**
     * 原子写入提问对:user 消息 + assistant(pending) 占位,并推进会话 updated_at。
     * 并发重复提交撞 UNIQUE(conversation_id, client_request_id) 时返回 null,
     * 调用方回到 findQuestionPair 走幂等路径。
     */
    async insertQuestionPair(params: {
      conversationId: string;
      content: string;
      clientRequestId: string;
    }): Promise<{ userMessage: MessageRow; assistantMessage: MessageRow } | null> {
      try {
        return await db.transaction(async (tx) => {
          const [userMessage] = await tx
            .insert(messages)
            .values({
              conversationId: params.conversationId,
              workspaceId,
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
              workspaceId,
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
            .where(
              and(
                eq(conversations.id, params.conversationId),
                eq(conversations.workspaceId, workspaceId),
              ),
            );
          return { userMessage, assistantMessage };
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return null;
        }
        throw err;
      }
    },

    /** failed → 允许显式重试(rag.md §23.3):把回复复位为 pending 再重新生成。 */
    async resetAssistantForRetry(assistantMessageId: string): Promise<void> {
      const updated = await db
        .update(messages)
        .set({ status: "pending", content: "", errorCode: null })
        .where(and(eq(messages.id, assistantMessageId), eq(messages.workspaceId, workspaceId)))
        .returning({ id: messages.id });
      if (updated.length === 0) {
        throw new NotFoundError("message not found in workspace");
      }
    },

    /** 引用全部通过校验后,答案与 citations 在同一事务落库(ADR-007)。 */
    async completeAssistant(params: {
      assistantMessageId: string;
      content: string;
      validatedCitations: ValidatedCitation[];
    }): Promise<CitationRow[]> {
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(messages)
          .set({ status: "completed", content: params.content, errorCode: null })
          .where(
            and(eq(messages.id, params.assistantMessageId), eq(messages.workspaceId, workspaceId)),
          )
          .returning({ id: messages.id });
        if (updated.length === 0) {
          throw new NotFoundError("message not found in workspace");
        }
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
    },

    async failAssistant(params: { assistantMessageId: string; errorCode: string }): Promise<void> {
      const updated = await db
        .update(messages)
        .set({ status: "failed", errorCode: params.errorCode })
        .where(
          and(eq(messages.id, params.assistantMessageId), eq(messages.workspaceId, workspaceId)),
        )
        .returning({ id: messages.id });
      if (updated.length === 0) {
        throw new NotFoundError("message not found in workspace");
      }
    },

    /** 会话历史里已完成的消息(检索上下文构建用),不含当前提问。 */
    async listCompletedMessagesBefore(params: {
      conversationId: string;
      beforeMessageId: string;
    }): Promise<MessageRow[]> {
      const rows = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, params.conversationId),
            eq(messages.status, "completed"),
            eq(messages.workspaceId, workspaceId),
          ),
        )
        .orderBy(asc(messages.createdAt), desc(messages.role));
      const cutoff = rows.findIndex((m) => m.id === params.beforeMessageId);
      return cutoff >= 0 ? rows.slice(0, cutoff) : rows;
    },

    /**
     * 向量检索(rag.md §17.1):问题向量化 → pgvector 余弦召回。
     * 租户/文档/版本过滤全部发生在 SQL 里(ADR-008 + processing_version 守卫):
     * 跨文档、陈旧版本的 chunk 根本进不了候选集。gateway 按调用传入,repo 不持有它。
     */
    async retrieveCandidates(input: {
      gateway: AIGateway;
      question: string;
      documentId: string;
      processingVersion: number;
      metadata: AIMetadata;
    }): Promise<ChunkCandidate[]> {
      const { embeddings } = await withSpan("retrieval.embed_query", () =>
        input.gateway.embed({
          capability: "embedding",
          texts: [input.question],
          metadata: input.metadata,
        }),
      );
      const queryVector = embeddings[0];
      if (!queryVector) {
        return [];
      }

      const distance = cosineDistance(documentChunks.embedding, queryVector);
      return withSpan("retrieval.vector_search", () =>
        db
          .select({
            chunkId: documentChunks.id,
            // 携带 chunk 的真实归属文档,供引用跨文档校验(WRONG_DOCUMENT)独立成立,见 toCitationSources。
            documentId: documentChunks.documentId,
            chunkIndex: documentChunks.chunkIndex,
            content: documentChunks.content,
            contentHash: documentChunks.contentHash,
            tokenCount: documentChunks.tokenCount,
            pageStart: documentChunks.pageStart,
            pageEnd: documentChunks.pageEnd,
            score: sql<number>`1 - (${distance})`,
          })
          .from(documentChunks)
          .where(
            and(
              eq(documentChunks.workspaceId, workspaceId),
              eq(documentChunks.documentId, input.documentId),
              eq(documentChunks.processingVersion, input.processingVersion),
              isNotNull(documentChunks.embedding),
            ),
          )
          .orderBy(distance)
          .limit(RETRIEVAL.candidateLimit),
      );
    },
  };
}

export type ScopedConversationRepo = ReturnType<typeof scopedConversationRepo>;

/** postgres.js 的唯一约束冲突(SQLSTATE 23505)。 */
function isUniqueViolation(err: unknown): boolean {
  let current = err;
  const seen = new Set<unknown>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && (current as { code?: unknown }).code === "23505") {
      return true;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}
