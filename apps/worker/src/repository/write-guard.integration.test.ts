import { EMBEDDING_DIMENSIONS } from "@doc-pilot/contracts";
import { db, queryClient } from "@doc-pilot/database";
import {
  documentChunks,
  documents,
  processingJobs,
  user,
  workspaces,
} from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Chunk, EmbeddedChunks } from "../pipeline";
import { markStage, saveChunksAndFinalize } from "./document.repository";

/**
 * processing_version 写守卫的端到端回归网(pipeline.md §24、CLAUDE.md 不变量):
 * 文档中途被标记删除、或 processing_version 被 bump 后,陈旧任务的
 * saveChunksAndFinalize / markStage 必须整体拒绝——不写 chunk、不复位状态、
 * 不推进 processing_jobs。单测 processing-guard.test.ts 钉的是谓词本身,
 * 这里钉的是「谓词真的接进了事务写入点」。
 */

// 唯一 runId 隔离本次夹具(见 tdd.md「集成测试自我隔离」)。
const runId = `write-guard-it-${Date.now()}`;
const ownerId = `${runId}-owner`;
let workspaceId = "";

interface SeededDoc {
  documentId: string;
  jobIdempotencyKey: string;
}

async function seedDocument(input: {
  key: string;
  status: string;
  processingVersion?: number;
}): Promise<SeededDoc> {
  const [doc] = await db
    .insert(documents)
    .values({
      workspaceId,
      ownerId,
      title: input.key,
      originalFilename: `${input.key}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: input.status,
      processingVersion: input.processingVersion ?? 1,
    })
    .returning({ id: documents.id });
  if (!doc) {
    throw new Error("集成测试 document 创建失败");
  }
  const jobIdempotencyKey = `${runId}:${input.key}`;
  await db.insert(processingJobs).values({
    workspaceId,
    documentId: doc.id,
    type: "process_document",
    stage: "parse",
    status: "pending",
    idempotencyKey: jobIdempotencyKey,
    payload: { documentId: doc.id, workspaceId, processingVersion: 1 },
  });
  return { documentId: doc.id, jobIdempotencyKey };
}

function chunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    chunkIndex: 0,
    content: "守卫测试内容",
    contentHash: "c".repeat(64),
    tokenCount: 4,
    pageStart: 1,
    pageEnd: 1,
    sectionPath: [],
    metadata: { parserVersion: "test", chunkerVersion: "test" },
    ...overrides,
  };
}

function embeddedOf(count: number): EmbeddedChunks {
  return {
    vectors: Array.from({ length: count }, () =>
      Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0),
    ),
    model: "test",
  };
}

/** 收尾入参夹具:陈旧任务恒以 processingVersion=1 的视角发起写入。 */
function finalizeParams(target: SeededDoc) {
  return {
    documentId: target.documentId,
    workspaceId,
    processingVersion: 1,
    jobIdempotencyKey: target.jobIdempotencyKey,
    pageCount: 1,
    textLength: 12,
    chunks: [chunk()],
    embedded: embeddedOf(1),
    summary: null,
    summaryError: null,
  };
}

async function fetchDocument(documentId: string) {
  const [row] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!row) {
    throw new Error(`document ${documentId} 丢失`);
  }
  return row;
}

async function fetchJob(idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.idempotencyKey, idempotencyKey));
  if (!row) {
    throw new Error(`processing_job ${idempotencyKey} 丢失`);
  }
  return row;
}

async function chunkRowsOf(documentId: string) {
  return db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
}

beforeAll(async () => {
  await db.insert(user).values({
    id: ownerId,
    name: ownerId,
    email: `${ownerId}@test.local`,
    emailVerified: true,
  });
  const [ws] = await db.insert(workspaces).values({ name: runId, ownerId }).returning();
  if (!ws) {
    throw new Error("集成测试 workspace 创建失败");
  }
  workspaceId = ws.id;
});

afterAll(async () => {
  // 删 user 级联清掉 workspace / documents / chunks / jobs / notifications(与现有集成测试同法)。
  await db.delete(user).where(eq(user.id, ownerId));
  await queryClient.end();
});

describe("saveChunksAndFinalize 写守卫", () => {
  it("处理中途被标记删除 → finalized:false 且不写入任何 chunk、不复位删除状态", async () => {
    const target = await seedDocument({ key: "finalize-deleting", status: "processing" });
    // 模拟处理中途用户删除:worker 已带着算好的 chunks 回来,但文档已进入 deleting。
    await db
      .update(documents)
      .set({ status: "deleting" })
      .where(eq(documents.id, target.documentId));

    const result = await saveChunksAndFinalize(finalizeParams(target));

    expect(result).toMatchObject({ finalized: false, notification: null });
    expect(await chunkRowsOf(target.documentId)).toHaveLength(0);
    // 状态不得被复活成 ready/processing,任务也不得被标记完成。
    expect(await fetchDocument(target.documentId)).toMatchObject({
      status: "deleting",
      chunkCount: null,
    });
    expect(await fetchJob(target.jobIdempotencyKey)).toMatchObject({ status: "pending" });
  });

  it("processing_version 被 bump → 陈旧任务 finalized:false 且不写入任何 chunk", async () => {
    // 文档已被重处理到 v2,携带 v1 的陈旧任务回写必须被拒。
    const target = await seedDocument({
      key: "finalize-stale",
      status: "processing",
      processingVersion: 2,
    });

    const result = await saveChunksAndFinalize(finalizeParams(target));

    expect(result).toMatchObject({ finalized: false, notification: null });
    expect(await chunkRowsOf(target.documentId)).toHaveLength(0);
    expect(await fetchDocument(target.documentId)).toMatchObject({
      status: "processing",
      processingVersion: 2,
      chunkCount: null,
    });
    expect(await fetchJob(target.jobIdempotencyKey)).toMatchObject({ status: "pending" });
  });

  it("守卫通过时正常收尾(正向对照,证明拒绝确因守卫而非夹具残缺)", async () => {
    const target = await seedDocument({ key: "finalize-ok", status: "processing" });

    const result = await saveChunksAndFinalize(finalizeParams(target));

    expect(result.finalized).toBe(true);
    expect(result.notification).not.toBeNull();
    const rows = await chunkRowsOf(target.documentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workspaceId, processingVersion: 1 });
    expect(await fetchDocument(target.documentId)).toMatchObject({
      status: "ready",
      chunkCount: 1,
      progress: 100,
    });
    expect(await fetchJob(target.jobIdempotencyKey)).toMatchObject({ status: "completed" });
  });
});

describe("markStage 写守卫", () => {
  it("处理中途被标记删除 → 拒绝推进:不把 deleting 复位成 processing", async () => {
    const target = await seedDocument({ key: "stage-deleting", status: "deleting" });

    await markStage({
      documentId: target.documentId,
      workspaceId,
      processingVersion: 1,
      jobIdempotencyKey: target.jobIdempotencyKey,
      stage: "embed",
      progress: 60,
    });

    expect(await fetchDocument(target.documentId)).toMatchObject({
      status: "deleting",
      currentStage: null,
      progress: 0,
    });
    expect(await fetchJob(target.jobIdempotencyKey)).toMatchObject({
      status: "pending",
      stage: "parse",
    });
  });

  it("processing_version 被 bump → 陈旧任务拒绝推进阶段", async () => {
    const target = await seedDocument({
      key: "stage-stale",
      status: "processing",
      processingVersion: 2,
    });

    await markStage({
      documentId: target.documentId,
      workspaceId,
      processingVersion: 1,
      jobIdempotencyKey: target.jobIdempotencyKey,
      stage: "embed",
      progress: 60,
    });

    expect(await fetchDocument(target.documentId)).toMatchObject({
      currentStage: null,
      progress: 0,
      processingVersion: 2,
    });
    expect(await fetchJob(target.jobIdempotencyKey)).toMatchObject({
      status: "pending",
      stage: "parse",
    });
  });

  it("守卫通过时正常推进(正向对照):状态/阶段/进度与任务同步更新", async () => {
    const target = await seedDocument({ key: "stage-ok", status: "queued" });

    await markStage({
      documentId: target.documentId,
      workspaceId,
      processingVersion: 1,
      jobIdempotencyKey: target.jobIdempotencyKey,
      stage: "parse",
      progress: 10,
    });

    expect(await fetchDocument(target.documentId)).toMatchObject({
      status: "processing",
      currentStage: "parse",
      progress: 10,
    });
    expect(await fetchJob(target.jobIdempotencyKey)).toMatchObject({
      status: "running",
      stage: "parse",
    });
  });
});
