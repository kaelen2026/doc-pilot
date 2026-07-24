import { randomUUID } from "node:crypto";
import { db, queryClient } from "@doc-pilot/database";
import { outboxEvents } from "@doc-pilot/database/schema";
import {
  buildParseBullJobId,
  createRedisConnection,
  getDocumentProcessingQueue,
  QUEUE_NAMES,
  type Redis,
} from "@doc-pilot/queue";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startOutboxPublisher } from "./publisher";

/**
 * Outbox Publisher 可靠性回归网(ADR-005、pipeline.md §11):经公开入口
 * startOutboxPublisher 驱动真实 Postgres + Redis,钉住 claim 租约互斥/回收、
 * 发布成功进 published、错误分流(retryable → pending 重试 / non-retryable → failed)。
 * 行级断言只看本测试播种的行(按 id),不受表内其它数据影响。
 */

type OutboxRow = typeof outboxEvents.$inferSelect;

// 发布器 tick 间隔:足够小让测试快,足够大不至于空转刷库。
const TICK_MS = 25;
const seededIds: string[] = [];

function validPayload(): { documentId: string; workspaceId: string; processingVersion: number } {
  return { documentId: randomUUID(), workspaceId: randomUUID(), processingVersion: 1 };
}

async function seedEvent(
  overrides: Partial<typeof outboxEvents.$inferInsert> = {},
): Promise<OutboxRow> {
  const [row] = await db
    .insert(outboxEvents)
    .values({
      aggregateType: "document",
      aggregateId: randomUUID(),
      eventType: "document.processing.requested",
      payload: validPayload(),
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("集成测试 outbox 事件播种失败");
  }
  seededIds.push(row.id);
  return row;
}

async function fetchEvent(id: string): Promise<OutboxRow> {
  const [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, id));
  if (!row) {
    throw new Error(`outbox 事件 ${id} 丢失`);
  }
  return row;
}

/** 轮询直到断言条件满足;超时抛错并带上最后一次观测,便于定位。 */
async function waitForEvent(
  id: string,
  done: (row: OutboxRow) => boolean,
  timeoutMs = 15_000,
): Promise<OutboxRow> {
  const deadline = Date.now() + timeoutMs;
  let last = await fetchEvent(id);
  while (!done(last)) {
    if (Date.now() > deadline) {
      throw new Error(`waitForEvent 超时,最后状态:${JSON.stringify(last)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    last = await fetchEvent(id);
  }
  return last;
}

function payloadOf(row: OutboxRow): { documentId: string; processingVersion: number } {
  return row.payload as { documentId: string; processingVersion: number };
}

let connection: Redis;
// 独立于 publisher 内部 Queue 的断言用句柄(共享同一连接,BullMQ 不会替我们关掉它)。
let assertQueue: ReturnType<typeof getDocumentProcessingQueue>;

beforeAll(() => {
  connection = createRedisConnection();
  assertQueue = getDocumentProcessingQueue(connection);
});

afterAll(async () => {
  // 把发布进真实队列的测试 job 摘掉,不留给本地 worker 消费。
  for (const id of seededIds) {
    const row = await fetchEvent(id).catch(() => null);
    if (row) {
      const { documentId, processingVersion } = payloadOf(row);
      const job = await assertQueue.getJob(buildParseBullJobId(documentId, processingVersion));
      await job?.remove().catch(() => {});
    }
  }
  await db.delete(outboxEvents).where(inArray(outboxEvents.id, seededIds));
  await assertQueue.close();
  await connection.quit();
  await queryClient.end();
});

describe("outbox publisher:发布与租约", () => {
  let stopPublisher: (() => Promise<void>) | null = null;
  let publishable: OutboxRow;
  let rejected: OutboxRow;
  let leased: OutboxRow;
  let expired: OutboxRow;

  beforeAll(async () => {
    publishable = await seedEvent();
    rejected = await seedEvent({ eventType: "document.unknown.event" });
    // 新鲜租约:5 分钟内不该被任何 publisher 再次 claim。
    leased = await seedEvent({ status: "publishing", attempts: 1, attemptedAt: new Date() });
    // 过期租约(>5 分钟):视作 publisher 崩溃遗留,必须被回收重发。
    expired = await seedEvent({
      status: "publishing",
      attempts: 1,
      attemptedAt: new Date(Date.now() - 6 * 60_000),
    });
    stopPublisher = startOutboxPublisher({ connection, intervalMs: TICK_MS, batchSize: 100 });
  });

  afterAll(async () => {
    await stopPublisher?.();
  });

  it("合法 pending 事件发布成功:行进 published,BullMQ 以稳定 jobId 入队", async () => {
    const row = await waitForEvent(publishable.id, (r) => r.status === "published");
    expect(row).toMatchObject({ status: "published", attempts: 1, lastError: null });
    expect(row.publishedAt).not.toBeNull();

    const payload = payloadOf(publishable);
    const job = await assertQueue.getJob(
      buildParseBullJobId(payload.documentId, payload.processingVersion),
    );
    expect(job).toBeDefined();
    expect(job?.data).toMatchObject(payload);
  });

  it("未知事件类型是 non-retryable:行进 failed 且不再重试", async () => {
    const row = await waitForEvent(rejected.id, (r) => r.status === "failed");
    expect(row).toMatchObject({ status: "failed", attempts: 1 });
    expect(row.lastError).toBeTruthy();
    expect(row.publishedAt).toBeNull();

    // 再跑若干个 tick,确认 failed 是终态:不被重新 claim、attempts 不再增长。
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 6));
    expect(await fetchEvent(rejected.id)).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("已被 claim 且租约未过期的行不会被第二次 claim", async () => {
    // 同批播种的 pending 行已走完,证明 publisher 至少完整跑过一轮;再多等几个 tick。
    await waitForEvent(publishable.id, (r) => r.status === "published");
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 6));

    const row = await fetchEvent(leased.id);
    expect(row).toMatchObject({ status: "publishing", attempts: 1 });
    expect(row.publishedAt).toBeNull();

    const payload = payloadOf(leased);
    const job = await assertQueue.getJob(
      buildParseBullJobId(payload.documentId, payload.processingVersion),
    );
    expect(job).toBeUndefined();
  });

  it("过期的 publishing 行被回收:重新 claim 后发布成功,attempts 递增", async () => {
    const row = await waitForEvent(expired.id, (r) => r.status === "published");
    expect(row).toMatchObject({ status: "published", attempts: 2, lastError: null });
    expect(row.publishedAt).not.toBeNull();
  });
});

describe("outbox publisher:retryable 投递失败", () => {
  const metaKey = `bull:${QUEUE_NAMES.documentProcessing}:meta`;
  let savedMeta: Record<string, string> = {};
  let stopPublisher: (() => Promise<void>) | null = null;
  let retriable: OutboxRow;

  beforeAll(async () => {
    // 把 BullMQ 的 meta 键改成错误类型,让 queue.add 的 Lua 脚本确定性抛 WRONGTYPE
    // —— 模拟 Redis 投递故障;afterAll 恢复原值。这是唯一不侵入生产代码的注错点。
    savedMeta = await connection.hgetall(metaKey);
    await connection.del(metaKey);
    await connection.set(metaKey, "corrupted-by-publisher-integration-test");

    retriable = await seedEvent();
    stopPublisher = startOutboxPublisher({ connection, intervalMs: TICK_MS, batchSize: 100 });
  });

  afterAll(async () => {
    await stopPublisher?.();
    await connection.del(metaKey);
    if (Object.keys(savedMeta).length > 0) {
      await connection.hset(metaKey, savedMeta);
    }
  });

  it("Redis 投递失败是 retryable:行回 pending 等待重试,attempts 递增且记录错误", async () => {
    // 行在 publishing(claim)与 pending(投递失败回退)之间循环;轮询到失败回退的窗口即可。
    await waitForEvent(
      retriable.id,
      (r) => r.status === "pending" && r.attempts >= 1 && r.lastError !== null,
    );
    // 停掉 publisher:tick 会把已 claim 的批次处理完,行必然停在「pending + 错误已记录」。
    await stopPublisher?.();
    stopPublisher = null;

    const row = await fetchEvent(retriable.id);
    expect(row.status).toBe("pending");
    expect(row.attempts).toBeGreaterThanOrEqual(1);
    expect(row.lastError).toBeTruthy();
    expect(row.publishedAt).toBeNull();
  });
});
