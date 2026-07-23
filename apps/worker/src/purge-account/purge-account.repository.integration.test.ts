import { db, queryClient } from "@doc-pilot/database";
import { documentFiles, documents, user, workspaces } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPurgeDeps } from "./purge-account.repository";

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

  it("collectStorageKeys 只收集该用户的对象 key(租户隔离)", async () => {
    const keys = await deps.collectStorageKeys(userA);
    expect(keys).toContain(`${userA}/original.pdf`);
    expect(keys).not.toContain(`${userB}/original.pdf`);
  });

  it("守卫式 purge:冷静期未过(未到期)时命中 0 行,不删账户", async () => {
    const purged = await deps.purge(userC, new Date());
    expect(purged).toBe(false);
    expect(await db.select().from(user).where(eq(user.id, userC))).toHaveLength(1);
  });

  it("到期 purge:删 user 行级联清空其数据,且不触碰其它账户", async () => {
    const purged = await deps.purge(userA, new Date());
    expect(purged).toBe(true);

    // A 及其级联数据全清空。
    expect(await db.select().from(user).where(eq(user.id, userA))).toHaveLength(0);
    expect(await db.select().from(workspaces).where(eq(workspaces.id, workspaceA))).toHaveLength(0);
    expect(await db.select().from(documents).where(eq(documents.id, documentA))).toHaveLength(0);
    expect(
      await db.select().from(documentFiles).where(eq(documentFiles.documentId, documentA)),
    ).toHaveLength(0);

    // B 完全不受影响(跨账户隔离)。
    expect(await db.select().from(user).where(eq(user.id, userB))).toHaveLength(1);
  });
});
