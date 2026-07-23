/**
 * 一次性回填脚本:为「已有 chunk 但 embedding 版本过期(或为空)」的文档重新入队处理,
 * 让 Worker pipeline 用当前 EMBEDDING_VERSION / 维度重新生成向量。
 *
 * 背景:embedding 维度 / 模型迁移(如 1536→1024, text-embedding-3-small→bge-m3)后,
 * migration 会把旧向量置空,但代码里没有「版本不匹配自动重建」的逻辑,已有 ready 文档
 * 会一直缺向量、检索不到(retrieval 过滤 embedding IS NOT NULL)。本脚本补齐这一步。
 *
 * 做法(严格遵守 Outbox 不变量,ADR-005:绝不直接往 BullMQ 塞):
 *   逐文档在单事务里 status→queued + 插 processing_jobs + 插 outbox_events,
 *   复用同一 processing_version —— pipeline 的 saveChunksAndFinalize 会「先删后插」
 *   幂等重建该版本的全部 chunk,不产生重复,也无需 bump 版本。
 *   真正的重处理由常驻 Worker 的 Outbox publisher 消费事件后驱动。
 *
 * 用法(在 apps/worker 下):
 *   pnpm backfill:embeddings              # 全量回填
 *   pnpm backfill:embeddings --dry-run    # 只统计与列出,不写库
 *   pnpm backfill:embeddings --limit 50   # 最多处理 50 个文档
 *
 * 前提:需常驻 Worker 在跑(消费 outbox);否则事件会堆在 outbox 里等 Worker 启动后再发。
 */
import { buildParseJobId, EMBEDDING_VERSION } from "@doc-pilot/contracts";
import { db } from "@doc-pilot/database";
import {
  documentChunks,
  documents,
  outboxEvents,
  processingJobs,
} from "@doc-pilot/database/schema";
import { logger } from "@doc-pilot/observability";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";

/** 参与回填的文档终态:已就绪但向量过期的才需要重建。 */
const BACKFILLABLE_STATUS = ["ready", "partially_ready"] as const;

interface BackfillTarget {
  id: string;
  workspaceId: string;
  processingVersion: number;
}

/** 找出「当前版本的 chunk 存在,但 embedding 版本过期或为空」的文档。 */
async function findStaleDocuments(limit?: number): Promise<BackfillTarget[]> {
  const query = db
    .selectDistinct({
      id: documents.id,
      workspaceId: documents.workspaceId,
      processingVersion: documents.processingVersion,
    })
    .from(documents)
    .innerJoin(
      documentChunks,
      and(
        eq(documentChunks.documentId, documents.id),
        eq(documentChunks.processingVersion, documents.processingVersion),
      ),
    )
    .where(
      and(
        isNull(documents.deletedAt),
        inArray(documents.status, [...BACKFILLABLE_STATUS]),
        or(
          ne(documentChunks.embeddingVersion, EMBEDDING_VERSION),
          isNull(documentChunks.embedding),
        ),
      ),
    );
  const rows = await query;
  return limit ? rows.slice(0, limit) : rows;
}

/**
 * 为单个文档入队重处理。返回是否真的入队(false = 并发下状态已变,跳过)。
 * 与 completeUploadTx 同款事务:status→queued + processing_jobs + outbox,同一事务原子写入。
 */
async function enqueueReprocess(target: BackfillTarget): Promise<boolean> {
  const jobIdempotencyKey = buildParseJobId(target.id, target.processingVersion);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, target.id))
      .for("update");

    // 并发守卫:回填期间若文档已被删除/已在处理,跳过,不打断其自身流程。
    if (
      !current ||
      !BACKFILLABLE_STATUS.includes(current.status as (typeof BACKFILLABLE_STATUS)[number])
    ) {
      return false;
    }

    await tx
      .update(documents)
      .set({ status: "queued", visibility: "private", updatedAt: new Date() })
      .where(eq(documents.id, target.id));

    // 复用同一 processing_version 的幂等键;原任务 removeOnComplete 后 BullMQ jobId 可安全重用。
    await tx
      .insert(processingJobs)
      .values({
        workspaceId: target.workspaceId,
        documentId: target.id,
        type: "process_document",
        stage: "parse",
        status: "pending",
        idempotencyKey: jobIdempotencyKey,
        payload: {
          documentId: target.id,
          workspaceId: target.workspaceId,
          processingVersion: target.processingVersion,
        },
      })
      .onConflictDoNothing();

    await tx.insert(outboxEvents).values({
      aggregateType: "document",
      aggregateId: target.id,
      eventType: "document.processing.requested",
      payload: {
        documentId: target.id,
        workspaceId: target.workspaceId,
        processingVersion: target.processingVersion,
        jobIdempotencyKey,
      },
    });

    return true;
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;
  if (limitArg >= 0 && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
    throw new Error("--limit 需要一个正整数");
  }

  const targets = await findStaleDocuments(limit);
  logger.info("backfill.scan", {
    matched: targets.length,
    targetVersion: EMBEDDING_VERSION,
    dryRun,
    ...(limit ? { limit } : {}),
  });

  if (dryRun) {
    for (const t of targets) {
      logger.info("backfill.dry_run_target", {
        documentId: t.id,
        processingVersion: t.processingVersion,
      });
    }
    logger.info("backfill.done", { dryRun: true, wouldEnqueue: targets.length });
    return;
  }

  let enqueued = 0;
  let skipped = 0;
  for (const t of targets) {
    const ok = await enqueueReprocess(t);
    if (ok) enqueued += 1;
    else skipped += 1;
  }
  logger.info("backfill.done", { enqueued, skipped, total: targets.length });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("backfill.failed", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
