import { ACCOUNT_PURGE } from "@doc-pilot/contracts";
import { logger } from "@doc-pilot/observability";

/** 清理批量上限(ACCOUNT_PURGE 的放宽类型,便于测试注入自定义值)。 */
export interface PurgeConfig {
  batchSize: number;
}

/** 一个到期待删的账户(deletion_scheduled_at <= now)。 */
export interface DueAccount {
  userId: string;
}

/** 账户清理所需的副作用集合,注入以便单测(真实实现见 purge-account.repository.ts)。 */
export interface PurgeDeps {
  nowMs(): number;
  /** 拉取一批到期待删账户(deletion_scheduled_at <= now),上限 batchSize。 */
  listDue(now: Date, cfg: PurgeConfig): Promise<DueAccount[]>;
  /**
   * 守卫式硬删除并登记待删对象(单事务,崩溃安全):收集该账户的对象 key → 原子删 user 行
   * (仅当仍到期,未被撤销)→ 把 key 写入 pending_object_deletions。返回是否实际删除。
   * S3 对象不在此删——由 drain 阶段消费 pending_object_deletions,故删库与「登记待删」原子一致。
   */
  purgeAndEnqueue(userId: string, now: Date): Promise<boolean>;
}

export interface PurgeSummary {
  scanned: number;
  purged: number;
  skipped: number;
}

/**
 * 一轮账户清理:扫到期账户,逐个守卫式硬删除并把待删对象登记到持久队列。
 * 竞态安全:若期间用户撤销了注销,purgeAndEnqueue 的原子 WHERE 命中 0 行 → 跳过(既不删库、
 * 也不登记其对象)。对象存储的实际删除交给 runDrain(见 object-drain.ts)。
 */
export async function runPurge(
  deps: PurgeDeps,
  cfg: PurgeConfig = ACCOUNT_PURGE,
): Promise<PurgeSummary> {
  const now = new Date(deps.nowMs());
  const due = await deps.listDue(now, cfg);
  const summary: PurgeSummary = { scanned: due.length, purged: 0, skipped: 0 };

  for (const account of due) {
    const purged = await deps.purgeAndEnqueue(account.userId, now);
    if (purged) {
      summary.purged += 1;
      logger.warn("account.purge.deleted", { userId: account.userId });
    } else {
      summary.skipped += 1; // 期间被撤销注销(守卫未命中)。
    }
  }

  if (summary.scanned > 0) {
    logger.info("account.purge.completed", { ...summary });
  }
  return summary;
}
