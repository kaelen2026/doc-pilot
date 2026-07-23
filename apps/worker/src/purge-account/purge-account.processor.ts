import { errToLog, logger } from "@doc-pilot/observability";
import { createPurgeDeps } from "./purge-account.repository";
import { runPurge } from "./purger";

/**
 * maintenance 队列的账户清理任务处理器。周期性由 repeatable job 触发,跑一轮:
 * 扫描冷静期已过(deletion_scheduled_at <= now)的注销账户并硬删除。仿 reconcile.processor。
 */
export function createPurgeAccountProcessor(): () => Promise<void> {
  const deps = createPurgeDeps();
  return async function purgeAccount(): Promise<void> {
    try {
      await runPurge(deps);
    } catch (err) {
      logger.error("account.purge.run_failed", errToLog(err));
      throw err; // 交给 BullMQ 记为 failed;周期任务下一轮再来。
    }
  };
}
