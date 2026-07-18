import { buildParseJobId, QUEUE_NAMES } from "@doc-pilot/contracts";
import { type ConnectionOptions, Queue } from "bullmq";

export function getDocumentProcessingQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.documentProcessing, { connection });
}

/** maintenance 队列(cleanup / delete / reconcile,见 pipeline.md §12.1)。 */
export function getMaintenanceQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.maintenance, { connection });
}

/**
 * 解析任务的 BullMQ jobId:幂等键（buildParseJobId）里的 ":" 换成 "_"（BullMQ 不允许
 * jobId 含冒号）。DB 侧 processing_jobs.idempotency_key 仍保留冒号形式。
 * publisher 与 reconciler 共用,避免两处各写一份 replace 逻辑而漂移。
 */
export function buildParseBullJobId(documentId: string, version: number): string {
  return buildParseJobId(documentId, version).replaceAll(":", "_");
}
