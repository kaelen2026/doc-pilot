import {
  type AnyPgColumn,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { documentChunks } from "./chunk";
import { documents } from "./document";
import { workspaces } from "./workspace";

/**
 * 会话（见 docs/architecture/data-model.md §8.6）。
 * MVP 一个会话绑定一个文档;跨文档引用在业务校验层拦截(rag.md §19.2)。
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("conversations_workspace_document_idx").on(t.workspaceId, t.documentId)],
);

/**
 * 消息（§8.7）。role: user|assistant;status: pending|completed|failed
 * (VARCHAR + 应用层校验,合法取值见 @doc-pilot/contracts)。
 * UNIQUE(conversation_id, client_request_id) 是提问幂等的落点(rag.md §23.3):
 * 重复提交时 pending → 返回流状态,completed → 返回已有消息,failed → 允许重试。
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    clientRequestId: varchar("client_request_id", { length: 100 }),
    /** assistant 消息指向它回答的 user 消息;幂等重试时靠它找到配对的回复。 */
    parentMessageId: uuid("parent_message_id").references((): AnyPgColumn => messages.id, {
      onDelete: "cascade",
    }),
    generationId: uuid("generation_id"),
    errorCode: varchar("error_code", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("messages_conversation_request_unique").on(t.conversationId, t.clientRequestId),
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
  ],
);

/**
 * 引用（§8.8）。只保存通过全部业务校验(validateAnswer)的引用,
 * 支撑「引用 ID 有效性 100%」目标(ADR-007)。position 是引用在答案中的序号。
 */
export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    documentChunkId: uuid("document_chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
    quote: text("quote").notNull(),
    claim: text("claim"),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    score: numeric("score", { precision: 8, scale: 6 }),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("citations_message_idx").on(t.messageId)],
);
