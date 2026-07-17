import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { documents } from "./document";
import { workspaces } from "./workspace";

/**
 * 文档切片（见 docs/architecture/data-model.md §8.4、pipeline.md §15）。
 *
 * - `workspace_id` 冗余保存,是为了向量检索时直接在查询里做租户过滤(ADR-008)。
 * - `embedding` 在 Phase 4 保持为空,Phase 6 才写入;维度固定 1536(见 rag.md)。
 * - `unique(document_id, processing_version, chunk_index)` 保证同一版本重复处理
 *   不会产生重复 Chunk;Worker 侧再配合"先删后插"实现幂等重建。
 */
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    processingVersion: integer("processing_version").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    tokenCount: integer("token_count").notNull(),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    sectionPath: jsonb("section_path").$type<string[]>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddingModel: varchar("embedding_model", { length: 100 }),
    embeddingVersion: varchar("embedding_version", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("document_chunks_version_index_unique").on(
      t.documentId,
      t.processingVersion,
      t.chunkIndex,
    ),
    index("document_chunks_document_idx").on(t.documentId, t.processingVersion),
    index("document_chunks_workspace_idx").on(t.workspaceId),
  ],
);
