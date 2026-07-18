import { errToLog, logger } from "@doc-pilot/observability";
import type { Queue } from "bullmq";
import { createReconcileDeps } from "./reconcile.repository";
import { runReconciliation } from "./reconciler";

/**
 * maintenance 队列的 reconcile 任务处理器。周期性由 repeatable job 触发,
 * 跑一轮对账。processingQueue 用于检查/重新入队 document-processing 的 Job。
 */
export function createReconcileProcessor(processingQueue: Queue): () => Promise<void> {
  const deps = createReconcileDeps(processingQueue);
  return async function reconcile(): Promise<void> {
    try {
      await runReconciliation(deps);
    } catch (err) {
      logger.error("reconcile.run_failed", errToLog(err));
      throw err; // 交给 BullMQ 记为 failed;周期任务下一轮再来。
    }
  };
}
