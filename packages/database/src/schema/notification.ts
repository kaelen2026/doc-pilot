import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { workspaces } from "./workspace";

/**
 * 通知(收件箱式)。由 Worker 在文档处理终态的同一事务内写入——与状态变更原子落库,
 * 是通知的**持久事实源**;Redis pub/sub 只做实时脉冲(best-effort,见 @doc-pilot/queue)。
 *
 * - 租户隔离(ADR-008):workspace_id 进每条查询;通知是个人的,再按 user_id(收件人)过滤。
 * - type / resource_type 用 VARCHAR + 应用层校验(合法取值见 @doc-pilot/contracts),不用 PG ENUM
 *   (data-model.md §8.1:加约束比改 ENUM 更易迁移)。
 * - dedupe_key 唯一:reprocess / 对账重放同一终态事件不产生重复通知(幂等不变量,
 *   见 CLAUDE.md;NULL 之间互不冲突,故无 dedupe_key 的行不受约束)。
 * - read_at 为 null 即未读。
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // 收件人。TEXT 引用 Better Auth 的 user.id(见 document.owner_id 同款说明)。
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    resourceType: varchar("resource_type", { length: 50 }),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    dedupeKey: varchar("dedupe_key", { length: 255 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // 收件箱按时间倒序列出(按收件人)。
    index("notifications_recipient_created_idx").on(t.workspaceId, t.userId, t.createdAt.desc()),
    // 未读计数:部分索引只覆盖未读行,计数只扫未读。
    index("notifications_unread_idx").on(t.workspaceId, t.userId).where(sql`${t.readAt} is null`),
    // 幂等:同一终态事件(dedupe_key)只落一条。
    unique("notifications_dedupe_key_unique").on(t.dedupeKey),
  ],
);
