import { db } from "@doc-pilot/database";
import { documentFiles, documents, outboxEvents, processingJobs } from "@doc-pilot/database/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export type DocumentRow = typeof documents.$inferSelect;

export async function findByOwnerIdempotency(
  ownerId: string,
  idempotencyKey: string,
): Promise<DocumentRow | undefined> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), eq(documents.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row;
}

export async function insertDocument(values: {
  workspaceId: string;
  ownerId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  idempotencyKey?: string;
}): Promise<DocumentRow> {
  const [row] = await db
    .insert(documents)
    .values({
      workspaceId: values.workspaceId,
      ownerId: values.ownerId,
      title: values.title,
      originalFilename: values.originalFilename,
      mimeType: values.mimeType,
      sizeBytes: values.sizeBytes,
      status: "pending_upload",
      idempotencyKey: values.idempotencyKey,
    })
    .returning();
  if (!row) {
    throw new Error("failed to insert document");
  }
  return row;
}

export async function findByIdInWorkspace(
  id: string,
  workspaceId: string,
): Promise<DocumentRow | undefined> {
  const [row] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.workspaceId, workspaceId),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return row;
}

/**
 * 文档处理状态(状态可观察,见 pipeline.md §13)。按 workspaceId 过滤实现租户隔离。
 */
export async function getStatusById(id: string, workspaceId: string) {
  const [row] = await db
    .select({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      currentStage: documents.currentStage,
      progress: documents.progress,
      sizeBytes: documents.sizeBytes,
      pageCount: documents.pageCount,
      textLength: documents.textLength,
      chunkCount: documents.chunkCount,
      errorCode: documents.errorCode,
      errorMessage: documents.errorMessage,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.workspaceId, workspaceId),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return row;
}

export async function sumStorageBytes(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)` })
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), isNull(documents.deletedAt)));
  return Number(row?.total ?? 0);
}

export async function listByWorkspace(workspaceId: string) {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      currentStage: documents.currentStage,
      progress: documents.progress,
      sizeBytes: documents.sizeBytes,
      pageCount: documents.pageCount,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt));
}

/**
 * 确认上传的原子写入（Transactional Outbox，见 ADR-005 / pipeline.md §11）：
 * 在同一事务内更新 Document、创建 DocumentFile、创建 ProcessingJob（幂等键唯一）、
 * 写入 OutboxEvent。若文档已非 pending/uploaded 状态，则视为重复确认，直接返回。
 */
export async function completeUploadTx(params: {
  documentId: string;
  workspaceId: string;
  processingVersion: number;
  sizeBytes: number;
  provider: string;
  bucket: string;
  objectKey: string;
  contentType: string;
  checksumSha256?: string;
  jobIdempotencyKey: string;
}): Promise<{ document: DocumentRow; alreadyQueued: boolean }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, params.documentId))
      .for("update");

    if (!current) {
      throw new Error("document disappeared during complete-upload");
    }

    if (current.status !== "pending_upload" && current.status !== "uploaded") {
      // 重复确认：不再创建新任务 / 事件。
      return { document: current, alreadyQueued: true };
    }

    await tx
      .insert(documentFiles)
      .values({
        documentId: params.documentId,
        kind: "original",
        provider: params.provider,
        bucket: params.bucket,
        objectKey: params.objectKey,
        sizeBytes: params.sizeBytes,
        checksumSha256: params.checksumSha256,
        contentType: params.contentType,
      })
      .onConflictDoNothing();

    const [updated] = await tx
      .update(documents)
      .set({ status: "queued", sizeBytes: params.sizeBytes, updatedAt: new Date() })
      .where(eq(documents.id, params.documentId))
      .returning();

    await tx
      .insert(processingJobs)
      .values({
        workspaceId: params.workspaceId,
        documentId: params.documentId,
        type: "process_document",
        stage: "parse",
        status: "pending",
        idempotencyKey: params.jobIdempotencyKey,
        payload: {
          documentId: params.documentId,
          workspaceId: params.workspaceId,
          processingVersion: params.processingVersion,
        },
      })
      .onConflictDoNothing();

    await tx.insert(outboxEvents).values({
      aggregateType: "document",
      aggregateId: params.documentId,
      eventType: "document.processing.requested",
      payload: {
        documentId: params.documentId,
        workspaceId: params.workspaceId,
        processingVersion: params.processingVersion,
        jobIdempotencyKey: params.jobIdempotencyKey,
      },
    });

    return { document: updated ?? current, alreadyQueued: false };
  });
}
