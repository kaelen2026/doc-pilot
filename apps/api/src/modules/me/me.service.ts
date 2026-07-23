import { ACCOUNT_DELETION_COOLDOWN_MS } from "@doc-pilot/contracts";
import {
  clearDeletionScheduled,
  getDeletionScheduledAt,
  markDeletionScheduled,
} from "./me.repository";

/**
 * 请求注销账户:进入冷静期。到期(可硬删除)时刻 = now + 冷静期(见 contracts)。
 * 幂等:已在冷静期则返回既有到期时刻、不重置倒计时。真正的硬删除由 worker 到期扫描执行,
 * 期间账户被 requireActiveAccount 中间件冻结(仅能撤销 / 退出)。
 */
export async function requestAccountDeletion(userId: string): Promise<{ scheduledAt: Date }> {
  const scheduledAt = new Date(Date.now() + ACCOUNT_DELETION_COOLDOWN_MS);
  const written = await markDeletionScheduled(userId, scheduledAt);
  if (written) {
    return { scheduledAt };
  }
  // 已在冷静期:返回既有到期时刻。existing 理论上非空;并发下极小概率被撤销,兜底回退新值。
  const existing = await getDeletionScheduledAt(userId);
  return { scheduledAt: existing ?? scheduledAt };
}

/** 撤销注销:退出冷静期,账户恢复正常。幂等。 */
export async function cancelAccountDeletion(userId: string): Promise<void> {
  await clearDeletionScheduled(userId);
}
