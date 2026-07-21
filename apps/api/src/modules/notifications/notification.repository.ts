import { db } from "@doc-pilot/database";
import { notifications } from "@doc-pilot/database/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NotFoundError } from "../../shared/errors";

export type NotificationRow = typeof notifications.$inferSelect;

/**
 * 租户作用域的 notifications 数据访问(ADR-008,与 scopedConversationRepo 同范式)。
 * 工厂闭包住 workspaceId,把 `workspace_id` 过滤注入每条查询;通知是个人的,再叠加
 * `user_id`(收件人)过滤。调用方签名里不散落 workspaceId,新增方法也漏不掉租户边界。
 *
 * - 读:命中 0 行返回空/null,不泄露。
 * - 写(标记已读):命中 0 行抛 NotFoundError(越权或不存在,fail-loud)。
 * - 通知行由 Worker 写入(见 apps/worker),此处只读 + 标记已读。
 */
export function scopedNotificationRepo(workspaceId: string) {
  const scope = (userId: string) =>
    and(eq(notifications.workspaceId, workspaceId), eq(notifications.userId, userId));

  return {
    async list(params: { userId: string; limit: number }): Promise<NotificationRow[]> {
      return db
        .select()
        .from(notifications)
        .where(scope(params.userId))
        .orderBy(desc(notifications.createdAt))
        .limit(params.limit);
    },

    async getById(params: { userId: string; id: string }): Promise<NotificationRow | null> {
      const [row] = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.id, params.id), scope(params.userId)))
        .limit(1);
      return row ?? null;
    },

    async countUnread(params: { userId: string }): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(scope(params.userId), isNull(notifications.readAt)));
      return row?.count ?? 0;
    },

    /** 标记单条已读(幂等:coalesce 保留原 read_at,重复标记不改时间)。 */
    async markRead(params: { userId: string; id: string }): Promise<void> {
      const updated = await db
        .update(notifications)
        .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
        .where(and(eq(notifications.id, params.id), scope(params.userId)))
        .returning({ id: notifications.id });
      if (updated.length === 0) {
        throw new NotFoundError("notification not found in workspace");
      }
    },

    /** 全部标记已读,返回受影响条数。 */
    async markAllRead(params: { userId: string }): Promise<number> {
      const updated = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(scope(params.userId), isNull(notifications.readAt)))
        .returning({ id: notifications.id });
      return updated.length;
    },
  };
}

export type ScopedNotificationRepo = ReturnType<typeof scopedNotificationRepo>;
