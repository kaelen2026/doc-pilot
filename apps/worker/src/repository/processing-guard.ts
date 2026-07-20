/**
 * processing_version 写守卫(pipeline.md §24、CLAUDE.md 不变量)。
 *
 * 文档存在、未软删除、状态非 deleting/deleted、且 processing_version 与任务匹配时,
 * 才允许写入。任一不满足即为陈旧任务,必须跳过,避免复活已删除 / 已重处理的数据。
 *
 * 这是「读取式」守卫(先取行再判断):claimDocument 领取前、saveChunksAndFinalize
 * 事务内 FOR UPDATE 复检两处共用同一谓词。reconcile 用的是原子 WHERE 守卫(另一种机制,
 * 见 reconcile.repository 的 guardedDocumentWhere):同一不变量,不同表达。
 */
export function passesProcessingGuard<
  T extends { deletedAt: Date | null; status: string; processingVersion: number },
>(doc: T | undefined, expectedVersion: number): doc is T {
  return (
    doc !== undefined &&
    doc.deletedAt === null &&
    doc.status !== "deleting" &&
    doc.status !== "deleted" &&
    doc.processingVersion === expectedVersion
  );
}
