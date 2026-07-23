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

/**
 * 待删除的对象存储项(账户注销硬删除的持久化死信队列)。
 *
 * 删 user 行(FK 级联清库)会连带删掉 document_files 行,但**不会**删对象存储里的 S3 对象。
 * 为避免「删库后清 S3 失败 → 孤儿字节永不回收」,账户清理在删 user 的**同一事务**里把待删
 * objectKey 落到本表(崩溃安全);worker 周期 drain 本表:删对象成功即销行,失败则累加 attempts
 * 留作死信(attempts 达上限的行不再重试,供运维排查)。无 FK——记录的对象所属 user 已删除。
 */
export const pendingObjectDeletions = pgTable(
  "pending_object_deletions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 32 }).notNull(),
    bucket: varchar("bucket", { length: 255 }).notNull(),
    objectKey: varchar("object_key", { length: 1024 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // drain 扫描:WHERE attempts < maxAttempts ORDER BY created_at,按 (attempts, created_at) 命中。
    index("pending_object_deletions_scan_idx").on(t.attempts, t.createdAt),
  ],
);
