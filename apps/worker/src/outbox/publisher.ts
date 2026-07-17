import { db } from "@doc-pilot/database";
import { outboxEvents } from "@doc-pilot/database/schema";
import {
  buildParseJobId,
  getDocumentProcessingQueue,
  JOB_NAMES,
  type Redis,
} from "@doc-pilot/queue";
import { asc, eq } from "drizzle-orm";

interface ProcessingRequestedPayload {
  documentId: string;
  workspaceId: string;
  processingVersion: number;
}

/**
 * Outbox Publisher（ADR-005 / pipeline.md §11）。
 * 轮询 pending 事件（FOR UPDATE SKIP LOCKED），发布到 BullMQ 后标记 published。
 *
 * BullMQ jobId 用稳定幂等键，重复发布不会创建新 Job；配合 outbox 的
 * at-least-once 投递，即使发布后提交失败，下次重试也不会产生重复任务。
 */
export function startOutboxPublisher(opts: {
  connection: Redis;
  intervalMs: number;
  batchSize?: number;
}): () => Promise<void> {
  const queue = getDocumentProcessingQueue(opts.connection);
  const batchSize = opts.batchSize ?? 20;
  let stopped = false;

  async function tick(): Promise<void> {
    await db.transaction(async (tx) => {
      const events = await tx
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.status, "pending"))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(batchSize)
        .for("update", { skipLocked: true });

      for (const event of events) {
        if (event.eventType === "document.processing.requested") {
          const payload = event.payload as unknown as ProcessingRequestedPayload;
          // BullMQ 的 jobId 不允许包含冒号，故将稳定幂等键的 ":" 换成 "_"。
          // DB 侧 processing_jobs.idempotency_key 仍保留冒号形式（符合设计文档）。
          const jobId = buildParseJobId(payload.documentId, payload.processingVersion).replaceAll(
            ":",
            "_",
          );
          await queue.add(JOB_NAMES.processDocument, payload, {
            jobId,
            removeOnComplete: true,
            removeOnFail: false,
          });
        }

        await tx
          .update(outboxEvents)
          .set({ status: "published", publishedAt: new Date() })
          .where(eq(outboxEvents.id, event.id));
      }

      if (events.length > 0) {
        console.log(`[outbox] published ${events.length} event(s)`);
      }
    });
  }

  const timer = setInterval(() => {
    if (!stopped) {
      tick().catch((err) => console.error("[outbox] tick failed:", err));
    }
  }, opts.intervalMs);

  return async () => {
    stopped = true;
    clearInterval(timer);
    await queue.close();
  };
}
