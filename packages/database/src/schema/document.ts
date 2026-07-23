import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { workspaces } from "./workspace";

/**
 * 文档聚合根（见 docs/architecture/data-model.md §8.2）。
 * status/current_stage 用 VARCHAR + 应用层校验（合法取值见 @doc-pilot/contracts）。
 * owner_id 为 TEXT，引用 Better Auth 的 user.id（见 §8.1.1 说明）。
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending_upload"),
    visibility: varchar("visibility", { length: 16 }).notNull().default("private"),
    currentStage: varchar("current_stage", { length: 32 }),
    progress: integer("progress").notNull().default(0),
    pageCount: integer("page_count"),
    textLength: integer("text_length"),
    chunkCount: integer("chunk_count"),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    processingVersion: integer("processing_version").notNull().default(1),
    // 创建幂等（见 §23.1）：同一 workspace + owner + Idempotency-Key 返回同一文档。
    // 幂等键的作用域是租户内的——见下方唯一约束与 findByOwnerIdempotency（CLAUDE.md 租户隔离不变量）。
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    // 内容级去重（见 §23.4、pipeline.md §15.3）：原始文件的 SHA256(hex)。
    // 由 Worker 从真实字节计算后回填(权威),用于同 workspace 内容去重的快速查找。
    // 与 document_files.checksum_sha256 冗余,此处冗余出来只为按 workspace 建索引。
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("documents_workspace_created_idx")
      .on(t.workspaceId, t.createdAt.desc())
      .where(sql`${t.deletedAt} is null`),
    // 幂等唯一性按 workspace 作用域:同一 owner 在不同 workspace 复用同一 Idempotency-Key
    // 不得互相命中/冲突(租户隔离,见 CLAUDE.md 不变量与 findByOwnerIdempotency)。
    unique("documents_workspace_owner_idempotency_unique").on(
      t.workspaceId,
      t.ownerId,
      t.idempotencyKey,
    ),
    // 内容去重查找（§23.4）：按 (workspace, checksum) 命中已就绪文档。
    // 部分索引:只索引未删且已回填指纹的行,故未就绪/无指纹文档不参与去重。
    index("documents_workspace_checksum_idx")
      .on(t.workspaceId, t.checksumSha256)
      .where(sql`${t.deletedAt} is null and ${t.checksumSha256} is not null`),
    check("documents_visibility_check", sql`${t.visibility} in ('private', 'public')`),
    check(
      "documents_status_check",
      sql`${t.status} in ('pending_upload', 'uploaded', 'queued', 'processing', 'ready', 'partially_ready', 'failed', 'deleting', 'deleted')`,
    ),
    check(
      "documents_current_stage_check",
      sql`${t.currentStage} is null or ${t.currentStage} in ('validate', 'parse', 'clean', 'chunk', 'embed', 'summarize', 'finalize', 'delete')`,
    ),
  ],
);

/**
 * 物理文件（原始 PDF、派生文本、缩略图等）。与 Document 分离（§7.2）。
 */
export const documentFiles = pgTable(
  "document_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    bucket: varchar("bucket", { length: 255 }).notNull(),
    objectKey: varchar("object_key", { length: 1024 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("document_files_object_unique").on(t.provider, t.bucket, t.objectKey),
    index("document_files_document_idx").on(t.documentId),
  ],
);

/**
 * 处理任务（§8.5）。idempotency_key 唯一，保证同一版本任务不重复创建。
 */
export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    stage: varchar("stage", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("processing_jobs_idempotency_unique").on(t.idempotencyKey),
    index("processing_jobs_document_idx").on(t.documentId),
    check("processing_jobs_type_check", sql`${t.type} in ('process_document')`),
    check(
      "processing_jobs_stage_check",
      sql`${t.stage} in ('validate', 'parse', 'clean', 'chunk', 'embed', 'summarize', 'finalize', 'delete')`,
    ),
    check(
      "processing_jobs_status_check",
      sql`${t.status} in ('pending', 'running', 'retrying', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);

/**
 * Transactional Outbox（ADR-005，§11）。与业务状态在同一事务写入，
 * 由独立 Publisher 轮询发布到 BullMQ。
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("outbox_events_status_idx").on(t.status, t.createdAt),
    check(
      "outbox_events_status_check",
      sql`${t.status} in ('pending', 'publishing', 'published', 'failed')`,
    ),
  ],
);
