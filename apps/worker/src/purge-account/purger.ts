import { ACCOUNT_PURGE } from "@doc-pilot/contracts";
import { errToLog, logger } from "@doc-pilot/observability";

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
  /** 收集该账户注销后会成孤儿的对象存储 key(只读,不改数据)。 */
  collectStorageKeys(userId: string): Promise<string[]>;
  /** best-effort 删除单个对象(失败不应中断整批)。 */
  deleteStorageObject(key: string): Promise<void>;
  /**
   * 守卫式硬删除:仅当仍到期(deletion_scheduled_at <= now,即未被撤销/推后)才删,
   * 返回是否实际删除。删 user 行靠 FK 级联清空其全部数据。
   */
  purge(userId: string, now: Date): Promise<boolean>;
}

export interface PurgeSummary {
  scanned: number;
  purged: number;
  skipped: number;
}

/**
 * 一轮账户清理(仿 reconcile 的「扫库 → 逐条守卫式处理 → 汇总」)。逐个到期账户:
 *   1. 先收集对象存储 key(只读,安全);删库后 document_files 级联消失就取不到了。
 *   2. 守卫式硬删除:原子 WHERE 校验仍到期。若期间用户撤销了注销(该列被置空/推后),
 *      命中 0 行 → 跳过,且**绝不删其 S3 对象**——这是「冷静期可撤销」的竞态安全落点。
 *   3. 仅当确已删库,才 best-effort 清对象存储(单个失败只记日志、不中断整批)。
 * 顺序刻意为「先收集 → 守卫删库 → 再删 S3」:既保证撤销不误删文件,又保证删库后拿得到 key。
 */
export async function runPurge(
  deps: PurgeDeps,
  cfg: PurgeConfig = ACCOUNT_PURGE,
): Promise<PurgeSummary> {
  const now = new Date(deps.nowMs());
  const due = await deps.listDue(now, cfg);
  const summary: PurgeSummary = { scanned: due.length, purged: 0, skipped: 0 };

  for (const account of due) {
    const keys = await deps.collectStorageKeys(account.userId);
    const purged = await deps.purge(account.userId, now);
    if (!purged) {
      // 期间被撤销注销(守卫未命中):不删库、也不动 S3。
      summary.skipped += 1;
      continue;
    }
    summary.purged += 1;
    for (const key of keys) {
      try {
        await deps.deleteStorageObject(key);
      } catch (err) {
        // 残留一个孤儿对象好过卡住整批;失败 key 落日志待离线清理。
        logger.error("account.purge.storage_orphan", {
          userId: account.userId,
          key,
          ...errToLog(err),
        });
      }
    }
    logger.warn("account.purge.deleted", { userId: account.userId });
  }

  if (summary.scanned > 0) {
    logger.info("account.purge.completed", { ...summary });
  }
  return summary;
}
