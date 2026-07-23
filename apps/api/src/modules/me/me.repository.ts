import { db } from "@doc-pilot/database";
import { user } from "@doc-pilot/database/schema";
import { and, eq, isNull } from "drizzle-orm";

/** 读取账户注销冷静期状态:返回到期(硬删除)时刻;未请求注销则 null。 */
export async function getDeletionScheduledAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ deletionScheduledAt: user.deletionScheduledAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.deletionScheduledAt ?? null;
}

/**
 * 请求注销:仅当当前未处于冷静期(deletion_scheduled_at IS NULL)时写入到期时刻,
 * 返回是否本次写入。已在冷静期则不覆盖(不重置倒计时),交由 service 读回既有值。
 */
export async function markDeletionScheduled(userId: string, scheduledAt: Date): Promise<boolean> {
  const updated = await db
    .update(user)
    .set({ deletionScheduledAt: scheduledAt })
    .where(and(eq(user.id, userId), isNull(user.deletionScheduledAt)))
    .returning({ id: user.id });
  return updated.length > 0;
}

/** 撤销注销:清除冷静期标记,账户恢复正常。幂等(未在冷静期调用也无副作用)。 */
export async function clearDeletionScheduled(userId: string): Promise<void> {
  await db.update(user).set({ deletionScheduledAt: null }).where(eq(user.id, userId));
}
