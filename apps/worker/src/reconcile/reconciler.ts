import { RECONCILE } from "@doc-pilot/contracts";
import { logger } from "@doc-pilot/observability";

/** 对账阈值(RECONCILE 的放宽类型,便于测试注入自定义值)。 */
export interface ReconcileConfig {
  intervalMs: number;
  batchSize: number;
  queuedGraceMs: number;
  processingStuckMs: number;
  pendingUploadTtlMs: number;
  maxProcessingAgeMs: number;
}

/** 参与对账的文档状态(其余状态要么终态、要么无需对账,见 pipeline.md §13)。 */
export type ReconcileStatus = "pending_upload" | "queued" | "processing";

export interface StaleDocument {
  documentId: string;
  workspaceId: string;
  processingVersion: number;
  status: ReconcileStatus;
  /** 最近一次状态/阶段变更时间(queued/processing 用它判断是否卡住)。 */
  updatedAt: Date;
  /** 文档创建时间(pending_upload TTL、以及处理类的最大存活时长都以它为准)。 */
  createdAt: Date;
}

export type ReconcileAction =
  | { kind: "skip" }
  /** 重新入队:queued 丢了 Job,或 processing 崩了但还在最大存活时长内。 */
  | { kind: "recover" }
  /** 标记失败:pending_upload 废弃,或处理类文档超过最大存活时长仍未就绪。 */
  | { kind: "fail"; errorCode: string; errorMessage: string };

/**
 * 对账错误码(区别于 pipeline 的处理错误码,便于排查是"对账兜底"判的失败)。
 */
export const RECONCILE_ERROR_CODES = {
  uploadAbandoned: "UPLOAD_ABANDONED",
  timedOut: "RECONCILE_TIMED_OUT",
} as const;

/**
 * 纯函数:只按状态 + 时龄判定意图,不看队列状态(是否还有存活 Job 的检查在 IO 层,
 * 因为它要访问 BullMQ)。便于单测覆盖各状态与阈值边界。
 */
export function classifyStaleDocument(
  doc: StaleDocument,
  nowMs: number,
  cfg: ReconcileConfig = RECONCILE,
): ReconcileAction {
  const idleMs = nowMs - doc.updatedAt.getTime();
  const ageMs = nowMs - doc.createdAt.getTime();

  if (doc.status === "pending_upload") {
    // 用户始终没完成直传:超过 TTL 判废弃。以 createdAt 为准(pending_upload 不会被更新)。
    return ageMs >= cfg.pendingUploadTtlMs
      ? {
          kind: "fail",
          errorCode: RECONCILE_ERROR_CODES.uploadAbandoned,
          errorMessage: "上传未在有效期内完成,已由对账清理",
        }
      : { kind: "skip" };
  }

  // 处理类文档(queued/processing)存活过久仍未就绪 → 放弃(防毒丸文档被无限重入队)。
  if (ageMs >= cfg.maxProcessingAgeMs) {
    return {
      kind: "fail",
      errorCode: RECONCILE_ERROR_CODES.timedOut,
      errorMessage: "处理超过最大存活时长仍未就绪,已由对账终止",
    };
  }

  if (doc.status === "queued") {
    return idleMs >= cfg.queuedGraceMs ? { kind: "recover" } : { kind: "skip" };
  }
  // processing
  return idleMs >= cfg.processingStuckMs ? { kind: "recover" } : { kind: "skip" };
}

/** 对账所需的副作用集合,注入以便单测(真实实现见 reconcile.repository.ts)。 */
export interface ReconcileDeps {
  nowMs(): number;
  /** 拉取一批可能卡住的文档(粗过滤:updatedAt 早于最小阈值)。 */
  listStale(cfg: ReconcileConfig): Promise<StaleDocument[]>;
  /** 该文档是否还有存活的 BullMQ Job(waiting/active/delayed/prioritized)。 */
  hasLiveJob(doc: StaleDocument): Promise<boolean>;
  /** 守卫式复位并重新入队(仅当状态/版本未变、未删除时生效);返回是否实际生效。 */
  recover(doc: StaleDocument): Promise<boolean>;
  /** 守卫式标记 failed(documents + processing_jobs);返回是否实际生效。 */
  fail(doc: StaleDocument, errorCode: string, errorMessage: string): Promise<boolean>;
}

export interface ReconcileSummary {
  scanned: number;
  recovered: number;
  failed: number;
  skipped: number;
}

/**
 * 一轮对账(runbooks/failure-recovery.md §35.1)。逐个文档判定并修复:
 * - pending_upload 废弃 → failed;处理类超龄 → failed
 * - queued 丢 Job / processing 崩溃 → 无存活 Job 时重新入队
 * 所有写入都是守卫式的(校验状态/版本/未删除),即便多实例并发或与正常处理竞争也安全。
 */
export async function runReconciliation(
  deps: ReconcileDeps,
  cfg: ReconcileConfig = RECONCILE,
): Promise<ReconcileSummary> {
  const nowMs = deps.nowMs();
  const docs = await deps.listStale(cfg);
  const summary: ReconcileSummary = { scanned: docs.length, recovered: 0, failed: 0, skipped: 0 };

  for (const doc of docs) {
    const action = classifyStaleDocument(doc, nowMs, cfg);

    if (action.kind === "skip") {
      summary.skipped += 1;
      continue;
    }

    if (action.kind === "fail") {
      const applied = await deps.fail(doc, action.errorCode, action.errorMessage);
      if (applied) {
        summary.failed += 1;
        logger.warn("reconcile.failed_document", {
          documentId: doc.documentId,
          status: doc.status,
          errorCode: action.errorCode,
        });
      } else {
        summary.skipped += 1;
      }
      continue;
    }

    // recover:仍有存活 Job 说明系统在处理,跳过;否则复位重入队。
    if (await deps.hasLiveJob(doc)) {
      summary.skipped += 1;
      continue;
    }
    const applied = await deps.recover(doc);
    if (applied) {
      summary.recovered += 1;
      logger.warn("reconcile.recovered_document", {
        documentId: doc.documentId,
        status: doc.status,
      });
    } else {
      summary.skipped += 1;
    }
  }

  if (summary.scanned > 0) {
    logger.info("reconcile.completed", { ...summary });
  }
  return summary;
}
