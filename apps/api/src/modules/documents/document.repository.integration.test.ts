import { db, queryClient } from "@doc-pilot/database";
import {
  documents,
  outboxEvents,
  processingJobs,
  user,
  workspaces,
} from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scopedDocumentRepo } from "./document.repository";

// 与 conversation.repository.integration.test.ts 同构:两个 workspace + 唯一 runId 自我隔离,
// 验证 scopedDocumentRepo 把 `workspace_id` 过滤注入了每一条读写——租户隔离是 MVP 授权的全部
// (ADR-008 / cross-cutting.md),documents 也是租户作用域仓库,必须被「跨 workspace 不可见」钉住。
const runId = `doc-repo-it-${Date.now()}`;
const userA = `${runId}-a`;
const userB = `${runId}-b`;
const idempotencyKeyA = `${runId}-idem`;
const checksumA = `${runId}-sha256`;
let workspaceA = "";
let workspaceB = "";
let documentA = "";
// 正向 completeUploadTx 测试创建的文档:outbox_events 无外键、不随 user 级联,须记下来显式清理。
let uploadedDocumentId = "";

beforeAll(async () => {
  await db.insert(user).values([
    { id: userA, name: "A", email: `${userA}@test.local`, emailVerified: true },
    { id: userB, name: "B", email: `${userB}@test.local`, emailVerified: true },
  ]);
  const [a, b] = await db
    .insert(workspaces)
    .values([
      { name: "A", ownerId: userA },
      { name: "B", ownerId: userB },
    ])
    .returning();
  if (!a || !b) {
    throw new Error("集成测试 workspace 创建失败");
  }
  workspaceA = a.id;
  workspaceB = b.id;

  // 主文档:经 scoped 工厂创建,带创建幂等键,用于 findById / getStatusById / list /
  // findByOwnerIdempotency / completeUploadTx 的跨租户断言。
  const created = await scopedDocumentRepo(workspaceA).insertDocument({
    ownerId: userA,
    title: "tenant-a",
    originalFilename: "a.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1,
    idempotencyKey: idempotencyKeyA,
  });
  documentA = created.id;

  // 一份 ready + 带 checksum 的文档,专供 findReadyByChecksum(内容去重快速通道)的租户断言。
  await db.insert(documents).values({
    workspaceId: workspaceA,
    ownerId: userA,
    title: "ready-a",
    originalFilename: "ready.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1,
    status: "ready",
    checksumSha256: checksumA,
  });
});

afterAll(async () => {
  if (uploadedDocumentId) {
    await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, uploadedDocumentId));
  }
  // 删 user 级联清掉 workspace / documents(与 conversation 集成测试同法)。
  await db.delete(user).where(eq(user.id, userA));
  await db.delete(user).where(eq(user.id, userB));
  await queryClient.end();
});

describe("scopedDocumentRepo database invariants", () => {
  it("跨 workspace 读不到文档(findById / getStatusById)", async () => {
    expect(await scopedDocumentRepo(workspaceA).findById(documentA)).toBeDefined();
    expect(await scopedDocumentRepo(workspaceB).findById(documentA)).toBeUndefined();

    expect(await scopedDocumentRepo(workspaceA).getStatusById(documentA)).toBeDefined();
    expect(await scopedDocumentRepo(workspaceB).getStatusById(documentA)).toBeUndefined();

    // 行确实存在,B 读不到是租户过滤所致,而非文档不存在或被软删。
    expect(await db.select().from(documents).where(eq(documents.id, documentA))).toHaveLength(1);
  });

  it("按租户列举文档不会泄露其它 workspace(list)", async () => {
    const visible = await scopedDocumentRepo(workspaceA).list();
    const hidden = await scopedDocumentRepo(workspaceB).list();
    expect(visible.map((row) => row.id)).toContain(documentA);
    expect(hidden.map((row) => row.id)).not.toContain(documentA);
  });

  it("创建幂等按 workspace 隔离(findByOwnerIdempotency)", async () => {
    expect(
      await scopedDocumentRepo(workspaceA).findByOwnerIdempotency(userA, idempotencyKeyA),
    ).toBeDefined();
    // 同一 owner + 同一幂等键,换个 workspace 就不该命中——否则可跨租户串号(架构体检 E)。
    expect(
      await scopedDocumentRepo(workspaceB).findByOwnerIdempotency(userA, idempotencyKeyA),
    ).toBeUndefined();
  });

  it("内容去重快速通道按 workspace 隔离(findReadyByChecksum)", async () => {
    expect(await scopedDocumentRepo(workspaceA).findReadyByChecksum(checksumA)).toBeDefined();
    expect(await scopedDocumentRepo(workspaceB).findReadyByChecksum(checksumA)).toBeUndefined();
  });

  it("跨 workspace 不能确认上传(completeUploadTx)", async () => {
    // B 对 A 的文档确认上传:事务内 `for update` 选择带 workspace_id 过滤,选不到即抛,
    // 不产生任何写入(不建 DocumentFile / ProcessingJob / OutboxEvent)。
    await expect(
      scopedDocumentRepo(workspaceB).completeUploadTx({
        documentId: documentA,
        processingVersion: 1,
        sizeBytes: 1,
        provider: "minio",
        bucket: "docs",
        objectKey: "cross-tenant",
        contentType: "application/pdf",
        jobIdempotencyKey: `${runId}-job`,
      }),
    ).rejects.toThrow();

    // A 的文档状态未被 B 的越权确认改动,仍是初始 pending_upload。
    const stillPending = await scopedDocumentRepo(workspaceA).findById(documentA);
    expect(stillPending?.status).toBe("pending_upload");
  });

  it("合法确认上传原子落库(completeUploadTx):恰好 1 行 outbox + 1 行 job 且关联一致", async () => {
    // Transactional Outbox 的正向面(ADR-005):状态变更 + ProcessingJob + outbox_events
    // 必须在一次事务里同时落库,且三者的关联字段(documentId / workspaceId /
    // processingVersion / jobIdempotencyKey)完全一致——Publisher 与 Worker 全靠它们接力。
    const created = await scopedDocumentRepo(workspaceA).insertDocument({
      ownerId: userA,
      title: "upload-ok",
      originalFilename: "upload-ok.pdf",
      mimeType: "application/pdf",
      sizeBytes: 123,
      idempotencyKey: `${runId}-upload-ok`,
    });
    uploadedDocumentId = created.id;
    const jobIdempotencyKey = `${runId}-upload-ok-job`;

    const { document, alreadyQueued } = await scopedDocumentRepo(workspaceA).completeUploadTx({
      documentId: created.id,
      processingVersion: 1,
      sizeBytes: 123,
      provider: "minio",
      bucket: "docs",
      objectKey: `${runId}/upload-ok.pdf`,
      contentType: "application/pdf",
      jobIdempotencyKey,
    });

    expect(alreadyQueued).toBe(false);
    expect(document.status).toBe("queued");
    const [docRow] = await db.select().from(documents).where(eq(documents.id, created.id));
    expect(docRow?.status).toBe("queued");

    const jobs = await db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.documentId, created.id));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      workspaceId: workspaceA,
      type: "process_document",
      status: "pending",
      idempotencyKey: jobIdempotencyKey,
      payload: { documentId: created.id, workspaceId: workspaceA, processingVersion: 1 },
    });

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, created.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      aggregateType: "document",
      eventType: "document.processing.requested",
      status: "pending",
      payload: {
        documentId: created.id,
        workspaceId: workspaceA,
        processingVersion: 1,
        jobIdempotencyKey,
      },
    });
  });
});
