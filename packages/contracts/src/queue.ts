/**
 * 队列 / 任务的纯常量与幂等键构造（无 BullMQ 依赖，前后端与 API 均可引用）。
 * BullMQ 连接与 Queue 实例在 @doc-pilot/queue。
 */
export const QUEUE_NAMES = {
  documentProcessing: "document-processing",
  aiGeneration: "ai-generation",
  maintenance: "maintenance",
} as const;

export const JOB_NAMES = {
  processDocument: "process_document",
  reconcile: "reconcile",
  purgeAccount: "purge_account",
} as const;

/**
 * BullMQ Job ID 用稳定幂等键（见 pipeline.md §12.2）。
 * 同一版本重复发布不会创建新 Job。
 */
export function buildParseJobId(documentId: string, version: number): string {
  return `document:${documentId}:version:${version}:parse`;
}
