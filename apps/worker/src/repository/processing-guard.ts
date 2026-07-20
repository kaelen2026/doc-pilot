/**
 * processing_version 写守卫(pipeline.md §24、CLAUDE.md 不变量)。
 *
 * 文档存在、未软删除、状态未被 block、且 processing_version 与任务匹配时,
 * 才允许写入。任一不满足即为陈旧任务,必须跳过,避免复活已删除 / 已重处理的数据。
 *
 * 这是「读取式」守卫(先取行再判断),被 worker 侧所有文档写入点共用:claimDocument
 * 领取前、saveChunksAndFinalize / markStage / markFailed 事务内 FOR UPDATE 复检——
 * 同一谓词、单一真相源。reconcile 用的是原子 WHERE 守卫(另一种机制,见 reconcile.repository
 * 的 guardedDocumentWhere):同一不变量,不同表达。
 *
 * 默认只 block deleting / deleted(与领取/收尾语义一致)。markFailed 额外传入
 * READY_STATUSES,避免把已就绪文档的成功状态覆盖成 failed(见 §13、架构体检 E)。
 */

/** 已就绪状态:markFailed 不得把这些成功状态覆盖成 failed。 */
export const READY_STATUSES = ["ready", "partially_ready"] as const;

/** 任何处理写入都不得触碰的状态(删除中/已删除)。 */
const ALWAYS_BLOCKED = ["deleting", "deleted"] as const;

export interface WriteGuardPolicy {
  /** 除 deleting/deleted 外,额外禁止写入的状态。 */
  blockStatuses?: readonly string[];
}

export function passesProcessingGuard<
  T extends { deletedAt: Date | null; status: string; processingVersion: number },
>(doc: T | undefined, expectedVersion: number, policy: WriteGuardPolicy = {}): doc is T {
  if (doc === undefined || doc.deletedAt !== null || doc.processingVersion !== expectedVersion) {
    return false;
  }
  const blocked = new Set<string>([...ALWAYS_BLOCKED, ...(policy.blockStatuses ?? [])]);
  return !blocked.has(doc.status);
}
