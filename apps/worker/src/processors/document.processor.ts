import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildParseJobId } from "@doc-pilot/contracts";
import { downloadObjectToFile } from "@doc-pilot/storage";
import { type Job, UnrecoverableError } from "bullmq";
import { chunkDocument, cleanDocument, errorCodeOf, isRetryable, parseDocument } from "../pipeline";
import * as repo from "../repository/document.repository";

interface DocumentJobData {
  documentId: string;
  workspaceId: string;
  processingVersion: number;
}

/**
 * document-processing 队列处理器:parse → clean → chunk → finalize(见 pipeline.md §12–§16)。
 *
 * 关键保证:
 * - 处理前 + 写入前两次校验 processing_version(陈旧任务不复活数据)。
 * - Chunk 先删后插 + 唯一约束 → 重复任务不产生重复 Chunk。
 * - 每阶段更新 documents.status/current_stage/progress → 状态可观察。
 * - 可重试错误抛出交给 BullMQ 退避重试;不可重试错误用 UnrecoverableError 立即失败。
 * - 临时文件在 finally 中清理(§14.2)。
 */
export async function processDocumentJob(job: Job<DocumentJobData>): Promise<{
  status: "done" | "skipped";
  chunkCount?: number;
}> {
  const { documentId, processingVersion } = job.data;
  const jobIdempotencyKey = buildParseJobId(documentId, processingVersion);

  const claim = await repo.claimDocument({ documentId, processingVersion });
  if (!claim) {
    console.log(`[worker] skip ${documentId} v${processingVersion} (guard failed)`);
    return { status: "skipped" };
  }

  const workDir = join(tmpdir(), "docpilot", job.id ?? `${documentId}-v${processingVersion}`);
  const filePath = join(workDir, "original.pdf");

  try {
    await repo.markStage({ documentId, jobIdempotencyKey, stage: "parse", progress: 20 });
    await downloadObjectToFile(claim.objectKey, filePath);
    const parsed = await parseDocument({ filePath, mimeType: claim.mimeType });

    await repo.markStage({ documentId, jobIdempotencyKey, stage: "clean", progress: 45 });
    const cleaned = cleanDocument(parsed);

    await repo.markStage({ documentId, jobIdempotencyKey, stage: "chunk", progress: 70 });
    const chunks = chunkDocument(cleaned);

    const written = await repo.saveChunksAndFinalize({
      documentId,
      workspaceId: claim.workspaceId,
      processingVersion,
      jobIdempotencyKey,
      pageCount: cleaned.pageCount,
      textLength: cleaned.textLength,
      chunks,
    });

    if (!written) {
      console.log(`[worker] skip finalize ${documentId} (guard failed mid-run)`);
      return { status: "skipped" };
    }

    console.log(`[worker] done ${documentId} v${processingVersion}: ${chunks.length} chunks`);
    return { status: "done", chunkCount: chunks.length };
  } catch (err) {
    const errorCode = errorCodeOf(err);
    const message = err instanceof Error ? err.message : String(err);

    if (isRetryable(err)) {
      // 交给 BullMQ 退避重试;仅在最后一次尝试落库为 failed。
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade + 1 >= attempts) {
        await repo.markFailed({ documentId, jobIdempotencyKey, errorCode, errorMessage: message });
      }
      throw err;
    }

    // 不可重试:落库 failed 并阻止重试。
    await repo.markFailed({ documentId, jobIdempotencyKey, errorCode, errorMessage: message });
    throw new UnrecoverableError(`${errorCode}: ${message}`);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
