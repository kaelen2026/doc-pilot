import { db } from "@doc-pilot/database";
import { outboxEvents } from "@doc-pilot/database/schema";
import { errToLog, logger } from "@doc-pilot/observability";
import {
  buildParseBullJobId,
  getDocumentProcessingQueue,
  JOB_NAMES,
  PROCESSING_RETRY,
  type Redis,
} from "@doc-pilot/queue";
import { and, asc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";

const processingRequestedSchema = z.object({
  documentId: z.uuid(),
  workspaceId: z.uuid(),
  processingVersion: z.number().int().positive(),
});

type ClaimedEvent = typeof outboxEvents.$inferSelect;

export type ParsedOutboxEvent =
  | { ok: true; payload: z.infer<typeof processingRequestedSchema> }
  | { ok: false; reason: string };

/** 事件类型和 payload 都在产生副作用前验证，未知版本绝不静默确认。 */
export function parseOutboxEvent(eventType: string, payload: unknown): ParsedOutboxEvent {
  if (eventType !== "document.processing.requested") {
    return { ok: false, reason: `未知 Outbox 事件类型:${eventType}` };
  }
  const parsed = processingRequestedSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, reason: `Outbox payload 无效:${z.prettifyError(parsed.error)}` };
  }
  return { ok: true, payload: parsed.data };
}

/**
 * 用短事务领取一批事件。Redis 发布不再发生在数据库事务/行锁内，避免外部故障长期
 * 占用连接；`publishing` 是租约所有权，多个 Publisher 通过 SKIP LOCKED 互斥领取。
 */
async function claimBatch(batchSize: number): Promise<ClaimedEvent[]> {
  return db.transaction(async (tx) => {
    const expiredLease = new Date(Date.now() - 5 * 60_000);
    const events = await tx
      .select()
      .from(outboxEvents)
      .where(
        or(
          eq(outboxEvents.status, "pending"),
          and(eq(outboxEvents.status, "publishing"), lt(outboxEvents.attemptedAt, expiredLease)),
        ),
      )
      .orderBy(asc(outboxEvents.createdAt))
      .limit(batchSize)
      .for("update", { skipLocked: true });

    if (events.length === 0) {
      return [];
    }
    const claimed: ClaimedEvent[] = [];
    for (const event of events) {
      const [row] = await tx
        .update(outboxEvents)
        .set({
          status: "publishing",
          attempts: event.attempts + 1,
          attemptedAt: new Date(),
          lastError: null,
        })
        .where(eq(outboxEvents.id, event.id))
        .returning();
      if (row) {
        claimed.push(row);
      }
    }
    return claimed;
  });
}

async function markPublished(eventId: string): Promise<void> {
  await db
    .update(outboxEvents)
    .set({ status: "published", publishedAt: new Date(), lastError: null })
    .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.status, "publishing")));
}

async function markDeliveryError(
  eventId: string,
  error: unknown,
  retryable: boolean,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(outboxEvents)
    .set({ status: retryable ? "pending" : "failed", lastError: message.slice(0, 2000) })
    .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.status, "publishing")));
}

/** Outbox Publisher（ADR-005）。稳定 jobId 让发布成功、确认失败后的重试保持幂等。 */
export function startOutboxPublisher(opts: {
  connection: Redis;
  intervalMs: number;
  batchSize?: number;
}): () => Promise<void> {
  const queue = getDocumentProcessingQueue(opts.connection);
  const batchSize = opts.batchSize ?? 20;
  let stopped = false;
  let running = false;

  async function tick(): Promise<void> {
    if (running) {
      return;
    }
    running = true;
    try {
      const events = await claimBatch(batchSize);
      for (const event of events) {
        const parsed = parseOutboxEvent(event.eventType, event.payload);
        if (!parsed.ok) {
          const error = new Error(parsed.reason);
          await markDeliveryError(event.id, error, false);
          logger.error("outbox.rejected_event", {
            eventId: event.id,
            eventType: event.eventType,
            error: error.message,
          });
          continue;
        }

        try {
          const payload = parsed.payload;
          await queue.add(JOB_NAMES.processDocument, payload, {
            jobId: buildParseBullJobId(payload.documentId, payload.processingVersion),
            attempts: PROCESSING_RETRY.attempts,
            backoff: { ...PROCESSING_RETRY.backoff },
            removeOnComplete: true,
            removeOnFail: false,
          });
          await markPublished(event.id);
        } catch (error) {
          await markDeliveryError(event.id, error, true);
          logger.error("outbox.publish_failed", { eventId: event.id, ...errToLog(error) });
        }
      }
      if (events.length > 0) {
        logger.info("outbox.batch_completed", { count: events.length });
      }
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    if (!stopped) {
      tick().catch((err) => logger.error("outbox.tick_failed", errToLog(err)));
    }
  }, opts.intervalMs);

  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await queue.close();
  };
}
