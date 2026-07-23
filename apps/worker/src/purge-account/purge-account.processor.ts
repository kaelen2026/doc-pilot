import { errToLog, logger } from "@doc-pilot/observability";
import { runDrain } from "./object-drain";
import { createDrainDeps, createPurgeDeps } from "./purge-account.repository";
import { runPurge } from "./purger";

/**
 * maintenance 队列的账户清理任务处理器。周期性由 repeatable job 触发,一轮两步:
 *   1. runPurge:扫冷静期已过的注销账户,守卫式硬删库并把待删对象登记到持久队列。
 *   2. runDrain:消费持久队列,实际删除对象存储中的对象(失败留作死信,下轮重试)。
 * 两步都做:新登记的对象本轮即被 drain;历史失败的死信也在每轮被重试。仿 reconcile.processor。
 */
export function createPurgeAccountProcessor(): () => Promise<void> {
  const purgeDeps = createPurgeDeps();
  const drainDeps = createDrainDeps();
  return async function purgeAccount(): Promise<void> {
    try {
      await runPurge(purgeDeps);
      await runDrain(drainDeps);
    } catch (err) {
      logger.error("account.purge.run_failed", errToLog(err));
      throw err; // 交给 BullMQ 记为 failed;周期任务下一轮再来。
    }
  };
}
