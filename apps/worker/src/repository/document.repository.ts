import type { ProcessingStage } from "@doc-pilot/contracts";
import { EMBEDDING_VERSION } from "@doc-pilot/contracts";
import { db } from "@doc-pilot/database";
import {
  documentChunks,
  documentFiles,
  documents,
  processingJobs,
} from "@doc-pilot/database/schema";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Chunk, EmbeddedChunks } from "../pipeline";
import { passesProcessingGuard } from "./processing-guard";

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

/** 推进阶段:更新 documents 的状态/阶段/进度,并把 processing_jobs 标为 running。 */
export async function markStage(params: {
  documentId: string;
  jobIdempotencyKey: string;
  stage: ProcessingStage;
  progress: number;
}): Promise<void> {
  await db
    .update(documents)
    .set({
      status: "processing",
      currentStage: params.stage,
      progress: params.progress,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, params.documentId));

  await db
    .update(processingJobs)
    .set({ status: "running", stage: params.stage, startedAt: new Date() })
    .where(eq(processingJobs.idempotencyKey, params.jobIdempotencyKey));
}

/**
 * 幂等写入 Chunk 并收尾。整个操作在一个事务里:
 * 1. FOR UPDATE 重新校验版本守卫(防止期间被删除/重处理)。
 * 2. 先删后插当前版本的所有 Chunk —— 保证重复任务不产生重复 Chunk。
 * 3. 更新 documents 为 ready + 统计信息 + 摘要,processing_jobs 为 completed。
 * 摘要失败(summaryError 非空)时状态为 partially_ready:允许问答,摘要显示生成失败
 * (pipeline.md §13)。守卫失败返回 false(不写入)。
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
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [doc] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, params.documentId))
      .for("update");

    if (!passesProcessingGuard(doc, params.processingVersion)) {
      return false;
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

    await tx
      .update(documents)
      .set({
        status: params.summaryError ? "partially_ready" : "ready",
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

    return true;
  });
}

/** 标记处理失败(状态可观察 + 保留错误码,见 §13)。 */
export async function markFailed(params: {
  documentId: string;
  jobIdempotencyKey: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  await db
    .update(documents)
    .set({
      status: "failed",
      errorCode: params.errorCode,
      errorMessage: params.errorMessage.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, params.documentId));

  await db
    .update(processingJobs)
    .set({
      status: "failed",
      errorCode: params.errorCode,
      errorMessage: params.errorMessage.slice(0, 2000),
      completedAt: new Date(),
    })
    .where(eq(processingJobs.idempotencyKey, params.jobIdempotencyKey));
}
