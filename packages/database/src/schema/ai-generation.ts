import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

/**
 * AI 调用记录（docs/architecture/data-model.md §8.9、cross-cutting.md §28）。
 * 一行 = 一次 Gateway 调用，成功行带用量与成本，失败行带 error_code。
 *
 * - `status` 用 VARCHAR + 应用层校验（合法取值 succeeded / failed），不用 Postgres ENUM。
 * - `cost_micros` 为整数微货币：1 美元 = 1,000,000 micros。
 * - `document_id` 不加外键：文档可能被硬删，计费记录必须留存。
 * - 索引覆盖 cross-cutting.md §28 的聚合维度（按 Workspace/日期、按文档、按能力）。
 */
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    documentId: uuid("document_id"),
    capability: varchar("capability", { length: 50 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    promptId: varchar("prompt_id", { length: 100 }),
    promptVersion: varchar("prompt_version", { length: 50 }),
    status: varchar("status", { length: 30 }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cachedTokens: integer("cached_tokens"),
    costMicros: bigint("cost_micros", { mode: "number" }),
    latencyMs: integer("latency_ms"),
    timeToFirstTokenMs: integer("time_to_first_token_ms"),
    traceId: varchar("trace_id", { length: 100 }).notNull(),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("ai_generations_workspace_idx").on(t.workspaceId, t.createdAt),
    index("ai_generations_document_idx").on(t.documentId),
    index("ai_generations_capability_idx").on(t.capability, t.createdAt),
  ],
);
