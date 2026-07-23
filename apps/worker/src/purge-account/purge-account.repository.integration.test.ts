import { db, queryClient } from "@doc-pilot/database";
import {
  documentFiles,
  documents,
  pendingObjectDeletions,
  user,
  workspaces,
} from "@doc-pilot/database/schema";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrainDeps, createPurgeDeps } from "./purge-account.repository";

// 唯一 runId 隔离本次夹具(见 tdd.md「集成测试自我隔离」)。
const runId = `purge-it-${Date.now()}`;
const past = new Date(Date.now() - 60_000); // 已到期
const future = new Date(Date.now() + 60 * 60_000); // 冷静期未过

// A:已到期待删;B:正常账户(不该被碰);C:冷静期未过(守卫应拒删)。
const userA = `${runId}-a`;
const userB = `${runId}-b`;
const userC = `${runId}-c`;
let workspaceA = "";
let documentA = "";

async function seedUserWithDoc(input: {
  userId: string;
  deletionScheduledAt: Date | null;
}): Promise<{ workspaceId: string; documentId: string }> {
  await db.insert(user).values({
    id: input.userId,
    name: input.userId,
    email: `${input.userId}@test.local`,
    emailVerified: true,
    deletionScheduledAt: input.deletionScheduledAt,
  });
  const [ws] = await db
    .insert(workspaces)
    .values({ name: input.userId, ownerId: input.userId })
    .returning();
  if (!ws) {
    throw new Error("集成测试 workspace 创建失败");
  }
  const [doc] = await db
    .insert(documents)
    .values({
      workspaceId: ws.id,
      ownerId: input.userId,
      title: input.userId,
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: "ready",
    })
    .returning();
  if (!doc) {
    throw new Error("集成测试文档创建失败");
  }
  await db.insert(documentFiles).values({
    documentId: doc.id,
    kind: "original",
    provider: "s3",
    bucket: "test-bucket",
    objectKey: `${input.userId}/original.pdf`,
    sizeBytes: 1,
    contentType: "application/pdf",
  });
  return { workspaceId: ws.id, documentId: doc.id };
}

beforeAll(async () => {
  const a = await seedUserWithDoc({ userId: userA, deletionScheduledAt: past });
  workspaceA = a.workspaceId;
  documentA = a.documentId;
  await seedUserWithDoc({ userId: userB, deletionScheduledAt: null });
  await seedUserWithDoc({ userId: userC, deletionScheduledAt: future });
});

afterAll(async () => {
  for (const id of [userA, userB, userC]) {
    await db.delete(user).where(eq(user.id, id));
  }
  // pending_object_deletions 无 FK 到 user,不随级联清理,需按 runId 前缀显式清。
  await db
    .delete(pendingObjectDeletions)
    .where(like(pendingObjectDeletions.objectKey, `${runId}%`));
  await queryClient.end();
});

describe("createPurgeDeps 账户清理不变量", () => {
  const deps = createPurgeDeps();

  it("listDue 只返回到期账户,不含正常/冷静期未过的账户", async () => {
    const due = await deps.listDue(new Date(), { batchSize: 100 });
    const ids = due.map((d) => d.userId);
    expect(ids).toContain(userA);
    expect(ids).not.toContain(userB);
    expect(ids).not.toContain(userC);
  });

  it("守卫式 purge:冷静期未过时命中 0 行,不删账户、不登记待删对象", async () => {
    const purged = await deps.purgeAndEnqueue(userC, new Date());
    expect(purged).toBe(false);
    expect(await db.select().from(user).where(eq(user.id, userC))).toHaveLength(1);
    expect(
      await db
        .select()
        .from(pendingObjectDeletions)
        .where(eq(pendingObjectDeletions.objectKey, `${userC}/original.pdf`)),
    ).toHaveLength(0);
  });

  it("到期 purge:级联清空数据 + 把该账户对象登记到待删队列(仅其自己的,租户隔离)", async () => {
    const purged = await deps.purgeAndEnqueue(userA, new Date());
    expect(purged).toBe(true);

    // A 及其级联数据全清空。
    expect(await db.select().from(user).where(eq(user.id, userA))).toHaveLength(0);
    expect(await db.select().from(workspaces).where(eq(workspaces.id, workspaceA))).toHaveLength(0);
    expect(await db.select().from(documents).where(eq(documents.id, documentA))).toHaveLength(0);
    expect(
      await db.select().from(documentFiles).where(eq(documentFiles.documentId, documentA)),
    ).toHaveLength(0);

    // 待删队列登记了 A 的对象,且不含 B 的(隔离);B 账户本身完好。
    expect(
      await db
        .select()
        .from(pendingObjectDeletions)
        .where(eq(pendingObjectDeletions.objectKey, `${userA}/original.pdf`)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(pendingObjectDeletions)
        .where(eq(pendingObjectDeletions.objectKey, `${userB}/original.pdf`)),
    ).toHaveLength(0);
    expect(await db.select().from(user).where(eq(user.id, userB))).toHaveLength(1);
  });
});

describe("createDrainDeps 对象死信队列", () => {
  const drain = createDrainDeps();

  async function pendingIdForA(): Promise<string> {
    const [row] = await db
      .select({ id: pendingObjectDeletions.id })
      .from(pendingObjectDeletions)
      .where(eq(pendingObjectDeletions.objectKey, `${userA}/original.pdf`));
    if (!row) {
      throw new Error("未找到 A 的待删记录(应由上一个 describe 的 purge 登记)");
    }
    return row.id;
  }

  it("markFailed 累加 attempts 并保留行(留作重试/死信)", async () => {
    const id = await pendingIdForA();
    await drain.markFailed(id, "s3 down");
    const [row] = await db
      .select({
        attempts: pendingObjectDeletions.attempts,
        lastError: pendingObjectDeletions.lastError,
      })
      .from(pendingObjectDeletions)
      .where(eq(pendingObjectDeletions.id, id));
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toContain("s3 down");
  });

  it("listPending 排除超过 maxAttempts 的死信行", async () => {
    const id = await pendingIdForA();
    // attempts 已为 1;用 maxAttempts=1 时该行应被排除。
    const excluded = await drain.listPending({ batchSize: 500, maxAttempts: 1 });
    expect(excluded.map((r) => r.id)).not.toContain(id);
    // maxAttempts=10 时仍应取出。
    const included = await drain.listPending({ batchSize: 500, maxAttempts: 10 });
    expect(included.map((r) => r.id)).toContain(id);
  });

  it("markDone 销掉待删记录", async () => {
    const id = await pendingIdForA();
    await drain.markDone(id);
    expect(
      await db.select().from(pendingObjectDeletions).where(eq(pendingObjectDeletions.id, id)),
    ).toHaveLength(0);
  });
});
