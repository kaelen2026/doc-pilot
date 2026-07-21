import type { ProcessingStage } from "@doc-pilot/contracts";
import { EMBEDDING_VERSION, NOTIFICATION_RESOURCE, NOTIFICATION_TYPE } from "@doc-pilot/contracts";
import { db } from "@doc-pilot/database";
import {
  documentChunks,
  documentFiles,
  documents,
  notifications,
  processingJobs,
} from "@doc-pilot/database/schema";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Chunk, EmbeddedChunks } from "../pipeline";
import { passesProcessingGuard, READY_STATUSES } from "./processing-guard";

/**
 * 终态写入时顺带创建的通知(收件人为文档 owner)。返回给处理器,在事务提交后发实时脉冲。
 * 通知行本身与状态变更同事务落库(持久事实源);脉冲是 best-effort(见 @doc-pilot/queue)。
 */
export interface CreatedNotification {
  id: string;
  userId: string;
}

export interface ClaimedDocument {
  documentId: string;
  workspaceId: string;
  processingVersion: number;
  mimeType: string;
  objectKey: string;
}

/**
 * 领取任务前的版本守卫(见 pipeline.md §24、CLAUDE.md 不变量)。
 * 文档缺失 / 正在删除或已删除 / processing_version 不匹配 → 返回 null,
 * 调用方应直接跳过(任务正常完成,不重试),避免陈旧任务复活数据。
 */
export async function claimDocument(params: {
  documentId: string;
  processingVersion: number;
}): Promise<ClaimedDocument | null> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, params.documentId))
    .limit(1);

  if (!passesProcessingGuard(doc, params.processingVersion)) {
    return null;
  }

  const [file] = await db
    .select()
    .from(documentFiles)
    .where(and(eq(documentFiles.documentId, doc.id), eq(documentFiles.kind, "original")))
    .limit(1);

  if (!file) {
    return null;
  }

  return {
    documentId: doc.id,
    workspaceId: doc.workspaceId,
    processingVersion: doc.processingVersion,
    mimeType: doc.mimeType,
    objectKey: file.objectKey,
  };
}

export interface CanonicalDocument {
  id: string;
  processingVersion: number;
  status: string;
  pageCount: number | null;
  textLength: number | null;
  summary: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * 内容去重兜底查找（§23.4）：同一 workspace 内是否已有相同内容且已就绪的其它文档。
 * 只认 ready / partially_ready(已产出 chunk),排除自身;取最早的一份作 canonical(稳定)。
 * 租户隔离:workspaceId 直接进 where。命中则复制其结果,避免对相同内容重复 parse + embed。
 */
export async function findCanonicalByChecksum(params: {
  workspaceId: string;
  checksum: string;
  excludeDocumentId: string;
}): Promise<CanonicalDocument | null> {
  const [row] = await db
    .select({
      id: documents.id,
      processingVersion: documents.processingVersion,
      status: documents.status,
      pageCount: documents.pageCount,
      textLength: documents.textLength,
      summary: documents.summary,
      errorCode: documents.errorCode,
      errorMessage: documents.errorMessage,
    })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, params.workspaceId),
        eq(documents.checksumSha256, params.checksum),
        ne(documents.id, params.excludeDocumentId),
        inArray(documents.status, ["ready", "partially_ready"]),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(asc(documents.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * 读出某文档某版本的全部 chunk,重建为 pipeline 的 Chunk[] + EmbeddedChunks 形状,
 * 供去重路径直接复用(跳过 parse/clean/chunk/embed)。若无 chunk 或存在缺失向量,
 * 返回 null——调用方据此回退正常处理,不冒险写入不完整数据。
 */
export async function loadFinalizedContent(
  documentId: string,
  processingVersion: number,
): Promise<{ chunks: Chunk[]; embedded: EmbeddedChunks } | null> {
  const rows = await db
    .select()
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, documentId),
        eq(documentChunks.processingVersion, processingVersion),
      ),
    )
    .orderBy(asc(documentChunks.chunkIndex));

  if (rows.length === 0) {
    return null;
  }

  const chunks: Chunk[] = [];
  const vectors: number[][] = [];
  let model = "";
  for (const r of rows) {
    if (!r.embedding) {
      return null;
    }
    chunks.push({
      chunkIndex: r.chunkIndex,
      content: r.content,
      contentHash: r.contentHash,
      tokenCount: r.tokenCount,
      pageStart: r.pageStart ?? 0,
      pageEnd: r.pageEnd ?? 0,
      sectionPath: r.sectionPath ?? [],
      metadata: (r.metadata as Chunk["metadata"]) ?? { parserVersion: "", chunkerVersion: "" },
    });
    vectors.push(r.embedding);
    model = r.embeddingModel ?? model;
  }
  return { chunks, embedded: { vectors, model } };
}

/**
 * 推进阶段:更新 documents 的状态/阶段/进度,并把 processing_jobs 标为 running。
 * 与收尾一样在事务内 FOR UPDATE 复检版本守卫(passesProcessingGuard):陈旧任务或期间
 * 被删除(deleting/deleted)时命中不到守卫 → 整体跳过,不把 deleting 状态复位成 processing
 * (架构体检 E,pipeline.md §24)。
 */
export async function markStage(params: {
  documentId: string;
  processingVersion: number;
  jobIdempotencyKey: string;
  stage: ProcessingStage;
  progress: number;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [doc] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, params.documentId))
      .for("update");

    if (!passesProcessingGuard(doc, params.processingVersion)) {
      return;
    }

    await tx
      .update(documents)
      .set({
        status: "processing",
        currentStage: params.stage,
        progress: params.progress,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, params.documentId));

    await tx
      .update(processingJobs)
      .set({ status: "running", stage: params.stage, startedAt: new Date() })
      .where(eq(processingJobs.idempotencyKey, params.jobIdempotencyKey));
  });
}

/**
 * 幂等写入 Chunk 并收尾。整个操作在一个事务里:
 * 1. FOR UPDATE 重新校验版本守卫(防止期间被删除/重处理)。
 * 2. 先删后插当前版本的所有 Chunk —— 保证重复任务不产生重复 Chunk。
 * 3. 更新 documents 为 ready + 统计信息 + 摘要,processing_jobs 为 completed。
 * 摘要失败(summaryError 非空)时状态为 partially_ready:允许问答,摘要显示生成失败
 * (pipeline.md §13)。守卫失败返回 finalized=false(不写入)。
 *
 * 收尾为 ready 时,在**同一事务**内写一条 document.ready 通知(与状态变更原子落库);
 * partially_ready 不发通知(见通知中心决策:v1 只 ready + failed)。返回的 notification 供
 * 处理器在提交后发实时脉冲;dedupe_key 冲突(重放)时为 null,不重复通知(幂等不变量)。
 */
export async function saveChunksAndFinalize(params: {
  documentId: string;
  workspaceId: string;
  processingVersion: number;
  jobIdempotencyKey: string;
  pageCount: number;
  textLength: number;
  chunks: Chunk[];
  /** 与 chunks 同序同长的向量(embed stage 产物)。 */
  embedded: EmbeddedChunks;
  summary: Record<string, unknown> | null;
  summaryError: { code: string; message: string } | null;
  /** 原始文件的权威 SHA256:回填到 documents / document_files,供内容去重查找（§23.4）。 */
  checksumSha256?: string;
}): Promise<{ finalized: boolean; notification: CreatedNotification | null }> {
  return db.transaction(async (tx) => {
    const [doc] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, params.documentId))
      .for("update");

    if (!passesProcessingGuard(doc, params.processingVersion)) {
      return { finalized: false, notification: null };
    }

    await tx
      .delete(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, params.documentId),
          eq(documentChunks.processingVersion, params.processingVersion),
        ),
      );

    if (params.chunks.length !== params.embedded.vectors.length) {
      throw new Error(
        `chunks(${params.chunks.length}) 与向量(${params.embedded.vectors.length}) 数量不一致,拒绝写入`,
      );
    }

    if (params.chunks.length > 0) {
      await tx.insert(documentChunks).values(
        params.chunks.map((c, i) => ({
          workspaceId: params.workspaceId,
          documentId: params.documentId,
          processingVersion: params.processingVersion,
          chunkIndex: c.chunkIndex,
          content: c.content,
          contentHash: c.contentHash,
          tokenCount: c.tokenCount,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          sectionPath: c.sectionPath,
          metadata: c.metadata,
          embedding: params.embedded.vectors[i] ?? null,
          embeddingModel: params.embedded.model || null,
          embeddingVersion: EMBEDDING_VERSION,
        })),
      );
    }

    const finalStatus = params.summaryError ? "partially_ready" : "ready";

    await tx
      .update(documents)
      .set({
        status: finalStatus,
        currentStage: "finalize",
        progress: 100,
        pageCount: params.pageCount,
        textLength: params.textLength,
        chunkCount: params.chunks.length,
        summary: params.summary,
        errorCode: params.summaryError?.code ?? null,
        errorMessage: params.summaryError?.message ?? null,
        // 就绪时才写入内容指纹——findReadyByChecksum/findCanonicalByChecksum 只查已就绪文档,
        // 故指纹与「可去重」状态同时生效,未就绪文档不会被误命中。
        ...(params.checksumSha256 ? { checksumSha256: params.checksumSha256 } : {}),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, params.documentId));

    if (params.checksumSha256) {
      // 回填物理文件记录的 checksum(兑现 document_files.checksum_sha256 原有设计)。
      await tx
        .update(documentFiles)
        .set({ checksumSha256: params.checksumSha256 })
        .where(
          and(eq(documentFiles.documentId, params.documentId), eq(documentFiles.kind, "original")),
        );
    }

    await tx
      .update(processingJobs)
      .set({
        status: "completed",
        stage: "finalize",
        result: {
          chunkCount: params.chunks.length,
          pageCount: params.pageCount,
          summarized: params.summaryError === null,
        },
        completedAt: new Date(),
      })
      .where(eq(processingJobs.idempotencyKey, params.jobIdempotencyKey));

    // 仅 ready 发通知(partially_ready 不发,v1 决策)。收件人为文档 owner。
    // onConflictDoNothing:重放(同 processing_version 的重复投递)不产生重复通知。
    let notification: CreatedNotification | null = null;
    if (finalStatus === "ready") {
      const [row] = await tx
        .insert(notifications)
        .values({
          workspaceId: params.workspaceId,
          userId: doc.ownerId,
          type: NOTIFICATION_TYPE.documentReady,
          title: `《${doc.title}》已就绪`,
          body: "文档已完成解析,可以开始提问了。",
          resourceType: NOTIFICATION_RESOURCE.document,
          resourceId: params.documentId,
          dedupeKey: `document:${params.documentId}:v${params.processingVersion}:ready`,
        })
        .onConflictDoNothing({ target: notifications.dedupeKey })
        .returning({ id: notifications.id, userId: notifications.userId });
      notification = row ?? null;
    }

    return { finalized: true, notification };
  });
}

/**
 * 标记处理失败(状态可观察 + 保留错误码,见 §13)。
 * 事务内 FOR UPDATE 复检版本守卫,并额外 block READY_STATUSES:at-least-once 重复投递下,
 * 一次投递已成功(ready/partially_ready)后,另一次投递末次尝试失败不得把成功覆盖成 failed
 * (架构体检 E)。守卫不通过则整体跳过——不改文档、也不把 processing_jobs 标失败。
 *
 * 落 failed 时在**同一事务**内写一条 document.failed 通知(收件人为文档 owner);返回给
 * 处理器在提交后发脉冲。dedupe_key 冲突(重放)→ null,不重复通知。守卫跳过时也返回 null。
 */
export async function markFailed(params: {
  documentId: string;
  processingVersion: number;
  jobIdempotencyKey: string;
  errorCode: string;
  errorMessage: string;
}): Promise<CreatedNotification | null> {
  return db.transaction(async (tx) => {
    const [doc] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, params.documentId))
      .for("update");

    if (!passesProcessingGuard(doc, params.processingVersion, { blockStatuses: READY_STATUSES })) {
      return null;
    }

    await tx
      .update(documents)
      .set({
        status: "failed",
        errorCode: params.errorCode,
        errorMessage: params.errorMessage.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, params.documentId));

    await tx
      .update(processingJobs)
      .set({
        status: "failed",
        errorCode: params.errorCode,
        errorMessage: params.errorMessage.slice(0, 2000),
        completedAt: new Date(),
      })
      .where(eq(processingJobs.idempotencyKey, params.jobIdempotencyKey));

    const [row] = await tx
      .insert(notifications)
      .values({
        workspaceId: doc.workspaceId,
        userId: doc.ownerId,
        type: NOTIFICATION_TYPE.documentFailed,
        title: `《${doc.title}》处理失败`,
        body: params.errorMessage.slice(0, 500),
        resourceType: NOTIFICATION_RESOURCE.document,
        resourceId: params.documentId,
        metadata: { errorCode: params.errorCode },
        dedupeKey: `document:${params.documentId}:v${params.processingVersion}:failed`,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id, userId: notifications.userId });
    return row ?? null;
  });
}
