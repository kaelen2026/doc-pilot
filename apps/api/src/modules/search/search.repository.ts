import type { AIGateway, AIMetadata } from "@doc-pilot/ai";
import { SEARCH } from "@doc-pilot/contracts";
import { db } from "@doc-pilot/database";
import { documentChunks, documents } from "@doc-pilot/database/schema";
import { withSpan } from "@doc-pilot/observability";
import { and, cosineDistance, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { SearchCandidate } from "./search-results";

/**
 * 租户作用域的全局搜索数据访问(ADR-008)。与 conversations 的 retrieveCandidates 同为
 * pgvector 余弦召回,唯一差异:**不限定 documentId**,改为跨整个 workspace 检索。
 *
 * 三条过滤都发生在 SQL 里,业务代码没有「忘加」的机会:
 * - `document_chunks.workspace_id = workspaceId`:租户隔离(该表专为向量检索携带此列)。
 * - `document_chunks.processing_version = documents.processing_version`:processing_version 守卫——
 *   去掉单一版本号入参后,改为 join 文档按其当前版本匹配,陈旧版本的 chunk 进不了候选集。
 * - `documents.deleted_at is null`:已删文档的 chunk 不出现在搜索结果里。
 */
export function scopedSearchRepo(workspaceId: string) {
  return {
    async searchChunks(input: {
      gateway: AIGateway;
      query: string;
      metadata: AIMetadata;
    }): Promise<SearchCandidate[]> {
      const { embeddings } = await withSpan("search.embed_query", () =>
        input.gateway.embed({
          capability: "embedding",
          texts: [input.query],
          metadata: input.metadata,
        }),
      );
      const queryVector = embeddings[0];
      if (!queryVector) {
        return [];
      }

      const distance = cosineDistance(documentChunks.embedding, queryVector);
      return withSpan("search.vector_search", () =>
        db
          .select({
            documentId: documentChunks.documentId,
            title: documents.title,
            chunkId: documentChunks.id,
            content: documentChunks.content,
            contentHash: documentChunks.contentHash,
            pageStart: documentChunks.pageStart,
            pageEnd: documentChunks.pageEnd,
            score: sql<number>`1 - (${distance})`,
          })
          .from(documentChunks)
          .innerJoin(documents, eq(documentChunks.documentId, documents.id))
          .where(
            and(
              eq(documentChunks.workspaceId, workspaceId),
              eq(documentChunks.processingVersion, documents.processingVersion),
              isNull(documents.deletedAt),
              isNotNull(documentChunks.embedding),
            ),
          )
          .orderBy(distance)
          .limit(SEARCH.candidateLimit),
      );
    },
  };
}

export type ScopedSearchRepo = ReturnType<typeof scopedSearchRepo>;
