import { OBJECT_PURGE } from "@doc-pilot/contracts";
import { errToLog, logger } from "@doc-pilot/observability";

/** drain 参数(OBJECT_PURGE 的放宽类型,便于测试注入)。 */
export interface DrainConfig {
  batchSize: number;
  maxAttempts: number;
}

/** 一条待删对象记录(pending_object_deletions 的一行)。 */
export interface PendingObject {
  id: string;
  objectKey: string;
}

/** 对象 drain 所需的副作用集合,注入以便单测(真实实现见 purge-account.repository.ts)。 */
export interface DrainDeps {
  /** 取一批未超重试上限的待删对象(attempts < maxAttempts),上限 batchSize。 */
  listPending(cfg: DrainConfig): Promise<PendingObject[]>;
  /** 删除对象存储中的对象(不存在也应成功——S3 delete 幂等)。 */
  deleteStorageObject(key: string): Promise<void>;
  /** 删除成功:销掉这条待删记录。 */
  markDone(id: string): Promise<void>;
  /** 删除失败:累加 attempts、记录 lastError / lastAttemptAt,留待下轮重试。 */
  markFailed(id: string, error: string): Promise<void>;
}

export interface DrainSummary {
  scanned: number;
  deleted: number;
  failed: number;
}

/**
 * 一轮对象存储 drain:消费 pending_object_deletions,逐条删对象。删成功即销行;失败累加 attempts
 * 留作死信,下轮重试;attempts 达 maxAttempts 的行不再被 listPending 取出(永久死信,供运维排查)。
 * S3 delete 幂等,故「上轮实删了但没来得及销行」的重试也安全(再删一次仍成功 → 销行)。
 */
export async function runDrain(
  deps: DrainDeps,
  cfg: DrainConfig = OBJECT_PURGE,
): Promise<DrainSummary> {
  const pending = await deps.listPending(cfg);
  const summary: DrainSummary = { scanned: pending.length, deleted: 0, failed: 0 };

  for (const obj of pending) {
    try {
      await deps.deleteStorageObject(obj.objectKey);
      await deps.markDone(obj.id);
      summary.deleted += 1;
    } catch (err) {
      await deps.markFailed(obj.id, String(err));
      summary.failed += 1;
      logger.error("account.purge.object_drain_failed", {
        id: obj.id,
        key: obj.objectKey,
        ...errToLog(err),
      });
    }
  }

  if (summary.scanned > 0) {
    logger.info("account.purge.object_drain_completed", { ...summary });
  }
  return summary;
}
