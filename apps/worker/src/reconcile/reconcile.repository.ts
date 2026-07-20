import { db } from "@doc-pilot/database";
import { documents, processingJobs } from "@doc-pilot/database/schema";
import {
  buildParseBullJobId,
  buildParseJobId,
  JOB_NAMES,
  PROCESSING_RETRY,
} from "@doc-pilot/queue";
import type { Queue } from "bullmq";
import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { ReconcileConfig, ReconcileDeps, ReconcileStatus, StaleDocument } from "./reconciler";

/** 参与对账的状态,与 StaleDocument.status 对应。 */
const RECONCILE_STATUSES = ["pending_upload", "queued", "processing"] as const;
/** 可被复位重入队 / 标记失败的处理类状态(守卫 WHERE 用)。 */
const RECOVERABLE_STATUSES = ["queued", "processing"] as const;

/** BullMQ 里视为"仍在处理"的 Job 状态。 */
const LIVE_JOB_STATES = new Set([
  "waiting",
  "waiting-children",
  "prioritized",
  "active",
  "delayed",
]);

/**
 * recover / fail 共用的原子守卫 WHERE:锁定同一文档、processing_version 匹配、未软删除,
 * 且当前状态在允许集内。与 processing-guard 的读取式守卫表达同一不变量(pipeline.md §24),
 * 但这里是 UPDATE 的原子条件——命中 0 行即说明期间被删除 / 重处理 / 已流转,放弃本次写入。
 */
function guardedDocumentWhere(doc: StaleDocument, statuses: readonly string[]) {
  return and(
    eq(documents.id, doc.documentId),
    eq(documents.processingVersion, doc.processingVersion),
    inArray(documents.status, [...statuses]),
    isNull(documents.deletedAt),
  );
}

/**
 * 用真实 DB + document-processing 队列构造 ReconcileDeps。
 * 所有写入都带守卫(状态/版本/未删除),遵守 processing_version 不变量(CLAUDE.md)。
 */
export function createReconcileDeps(processingQueue: Queue): ReconcileDeps {
  return {
    nowMs: () => Date.now(),

    async listStale(cfg: ReconcileConfig): Promise<StaleDocument[]> {
      // 粗过滤:最小阈值(queued 的宽限)以内的一律不看;精确判定交给 classifyStaleDocument。
      const cutoff = new Date(Date.now() - cfg.queuedGraceMs);
      const rows = await db
        .select({
          documentId: documents.id,
          workspaceId: documents.workspaceId,
          processingVersion: documents.processingVersion,
          status: documents.status,
          updatedAt: documents.updatedAt,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(
          and(
            isNull(documents.deletedAt),
            inArray(documents.status, [...RECONCILE_STATUSES]),
            lt(documents.updatedAt, cutoff),
          ),
        )
        .orderBy(asc(documents.updatedAt))
        .limit(cfg.batchSize);

      return rows.map((r) => ({
        documentId: r.documentId,
        workspaceId: r.workspaceId,
        processingVersion: r.processingVersion,
        status: r.status as ReconcileStatus,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
      }));
    },

    async hasLiveJob(doc: StaleDocument): Promise<boolean> {
      const job = await processingQueue.getJob(
        buildParseBullJobId(doc.documentId, doc.processingVersion),
      );
      if (!job) {
        return false;
      }
      const state = await job.getState();
      return LIVE_JOB_STATES.has(state);
    },

    async recover(doc: StaleDocument): Promise<boolean> {
      const reset = await db
        .update(documents)
        .set({ status: "queued", currentStage: null, progress: 0, updatedAt: new Date() })
        .where(guardedDocumentWhere(doc, RECOVERABLE_STATUSES))
        .returning({ id: documents.id });

      if (reset.length === 0) {
        return false; // 期间被删除 / 重处理 / 已流转,放弃。
      }

      // 幂等 jobId:若 Job 仍在(竞态)重复 add 不会产生新 Job。
      await processingQueue.add(
        JOB_NAMES.processDocument,
        {
          documentId: doc.documentId,
          workspaceId: doc.workspaceId,
          processingVersion: doc.processingVersion,
        },
        {
          jobId: buildParseBullJobId(doc.documentId, doc.processingVersion),
          attempts: PROCESSING_RETRY.attempts,
          backoff: { ...PROCESSING_RETRY.backoff },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      await db
        .update(processingJobs)
        .set({ status: "pending", errorCode: null, errorMessage: null })
        .where(
          eq(processingJobs.idempotencyKey, buildParseJobId(doc.documentId, doc.processingVersion)),
        );

      return true;
    },

    async fail(doc: StaleDocument, errorCode: string, errorMessage: string): Promise<boolean> {
      const failed = await db
        .update(documents)
        .set({ status: "failed", errorCode, errorMessage, updatedAt: new Date() })
        .where(guardedDocumentWhere(doc, RECONCILE_STATUSES))
        .returning({ id: documents.id });

      if (failed.length === 0) {
        return false;
      }

      // processing_jobs 可能不存在(pending_upload 阶段还没建),更新命中 0 行也无妨。
      await db
        .update(processingJobs)
        .set({ status: "failed", errorCode, errorMessage, completedAt: new Date() })
        .where(
          eq(processingJobs.idempotencyKey, buildParseJobId(doc.documentId, doc.processingVersion)),
        );

      return true;
    },
  };
}
