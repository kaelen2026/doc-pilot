import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DocumentSummary, isAIError } from "@doc-pilot/ai";
import { buildParseJobId } from "@doc-pilot/contracts";
import { errToLog, logger } from "@doc-pilot/observability";
import type { NotificationBus } from "@doc-pilot/queue";
import { downloadObjectToFile } from "@doc-pilot/storage";
import { type Job, UnrecoverableError } from "bullmq";
import { workerAIGateway } from "../ai/gateway";
import {
  chunkDocument,
  cleanDocument,
  embedChunks,
  errorCodeOf,
  hashFileSha256,
  isRetryable,
  parseDocument,
} from "../pipeline";
import { summarizeDocument } from "../pipeline/summarize";
import type { CreatedNotification } from "../repository/document.repository";
import * as repo from "../repository/document.repository";

interface DocumentJobData {
  documentId: string;
  workspaceId: string;
  processingVersion: number;
}

/**
 * document-processing 队列处理器:parse → clean → chunk → embed → summarize → finalize
 * (见 pipeline.md §12–§16、rag.md §21)。
 *
 * 关键保证:
 * - 处理前 + 写入前两次校验 processing_version(陈旧任务不复活数据)。
 * - Chunk 先删后插 + 唯一约束 → 重复任务不产生重复 Chunk。
 * - 每阶段更新 documents.status/current_stage/progress → 状态可观察。
 * - 可重试错误抛出交给 BullMQ 退避重试;不可重试错误用 UnrecoverableError 立即失败。
 * - 临时文件在 finally 中清理(§14.2)。
 * - 终态(ready / failed)在收尾事务内已写好通知行;此处仅在提交后发实时脉冲(best-effort)。
 *
 * notificationBus 依赖注入(与 reconcile 处理器同范式),便于 index.ts 接线、测试替身。
 * pushBadge 同为注入:给收件人发离线角标推送(APNS)。缺 APNS 配置时 index.ts 传 undefined,
 * 整条推送通路不接;发送失败也 best-effort 吞掉,绝不影响任务成败。
 */
export function createDocumentProcessor(deps: {
  notificationBus: NotificationBus;
  pushBadge?: (notification: CreatedNotification, workspaceId: string) => Promise<void>;
}) {
  return async function processDocumentJob(job: Job<DocumentJobData>): Promise<{
    status: "done" | "skipped";
    chunkCount?: number;
  }> {
    const { documentId, processingVersion, workspaceId } = job.data;
    const jobIdempotencyKey = buildParseJobId(documentId, processingVersion);
    const log = logger.child({ documentId, processingVersion, jobId: job.id });

    // 通知行是持久事实源。产出通知后向收件人做两件 best-effort 的事,彼此独立、互不拖累:
    // ① 发 SSE 脉冲让**在线**连接立刻刷新;② 发 APNS 角标推送让**离线/后台**设备更新红点。
    const notifyRecipient = async (notification: CreatedNotification | null): Promise<void> => {
      if (!notification) {
        return;
      }
      try {
        await deps.notificationBus.publish(workspaceId, notification);
      } catch (err) {
        log.warn("notification.pulse_failed", errToLog(err));
      }
      if (deps.pushBadge) {
        try {
          await deps.pushBadge(notification, workspaceId);
        } catch (err) {
          log.warn("notification.push_failed", errToLog(err));
        }
      }
    };

    const claim = await repo.claimDocument({ documentId, processingVersion });
    if (!claim) {
      log.info("document.skip", { reason: "guard_failed" });
      return { status: "skipped" };
    }

    const workDir = join(tmpdir(), "docpilot", job.id ?? `${documentId}-v${processingVersion}`);
    const filePath = join(workDir, "original.pdf");

    try {
      await repo.markStage({
        documentId,
        processingVersion,
        jobIdempotencyKey,
        stage: "parse",
        progress: 20,
      });
      await downloadObjectToFile(claim.objectKey, filePath);

      // 权威内容指纹:从实际下载的字节计算(不信前端,见 ADR-003)。
      const checksumSha256 = await hashFileSha256(filePath);

      // 内容去重兜底（§23.4）:未走前端快速通道的重复上传在此拦下——命中同 workspace 已就绪的
      // 相同内容文档,则直接复制其 chunk/摘要收尾,跳过 parse/clean/chunk/embed(省最贵的 AI 成本)。
      const canonical = await repo.findCanonicalByChecksum({
        workspaceId: claim.workspaceId,
        checksum: checksumSha256,
        excludeDocumentId: documentId,
      });
      if (canonical) {
        const content = await repo.loadFinalizedContent(canonical.id, canonical.processingVersion);
        if (content) {
          const summaryError =
            canonical.status === "partially_ready"
              ? {
                  code: canonical.errorCode ?? "SUMMARY_FAILED",
                  message: canonical.errorMessage ?? "",
                }
              : null;
          const result = await repo.saveChunksAndFinalize({
            documentId,
            workspaceId: claim.workspaceId,
            processingVersion,
            jobIdempotencyKey,
            pageCount: canonical.pageCount ?? 0,
            textLength: canonical.textLength ?? 0,
            chunks: content.chunks,
            embedded: content.embedded,
            summary: canonical.summary,
            summaryError,
            checksumSha256,
          });
          if (!result.finalized) {
            log.info("document.skip", { reason: "guard_failed_mid_run" });
            return { status: "skipped" };
          }
          await notifyRecipient(result.notification);
          log.info("document.deduped", {
            canonicalId: canonical.id,
            chunkCount: content.chunks.length,
          });
          return { status: "done", chunkCount: content.chunks.length };
        }
      }

      const parsed = await parseDocument({ filePath, mimeType: claim.mimeType });

      await repo.markStage({
        documentId,
        processingVersion,
        jobIdempotencyKey,
        stage: "clean",
        progress: 45,
      });
      const cleaned = cleanDocument(parsed);

      await repo.markStage({
        documentId,
        processingVersion,
        jobIdempotencyKey,
        stage: "chunk",
        progress: 60,
      });
      const chunks = chunkDocument(cleaned);

      // embed 失败会阻断管线(没有向量就没法问答):瞬时 AI 错误重试,其余判失败。
      await repo.markStage({
        documentId,
        processingVersion,
        jobIdempotencyKey,
        stage: "embed",
        progress: 75,
      });
      const embedded = await embedChunks({
        gateway: workerAIGateway(),
        chunks,
        metadata: {
          workspaceId: claim.workspaceId,
          documentId,
          traceId: jobIdempotencyKey,
        },
      });

      // 摘要失败不阻断管线:文档仍可问答,状态落为 partially_ready(pipeline.md §13)。
      await repo.markStage({
        documentId,
        processingVersion,
        jobIdempotencyKey,
        stage: "summarize",
        progress: 88,
      });
      let summary: DocumentSummary | null = null;
      let summaryError: { code: string; message: string } | null = null;
      try {
        summary = await summarizeDocument({
          gateway: workerAIGateway(),
          chunks,
          metadata: {
            workspaceId: claim.workspaceId,
            documentId,
            traceId: jobIdempotencyKey,
          },
        });
      } catch (err) {
        summaryError = {
          code: isAIError(err) ? err.code : "SUMMARY_FAILED",
          message: err instanceof Error ? err.message : String(err),
        };
        log.warn("document.summarize_failed", { code: summaryError.code });
      }

      const result = await repo.saveChunksAndFinalize({
        documentId,
        workspaceId: claim.workspaceId,
        processingVersion,
        jobIdempotencyKey,
        pageCount: cleaned.pageCount,
        textLength: cleaned.textLength,
        chunks,
        embedded,
        summary,
        summaryError,
        checksumSha256,
      });

      if (!result.finalized) {
        log.info("document.skip", { reason: "guard_failed_mid_run" });
        return { status: "skipped" };
      }

      await notifyRecipient(result.notification);
      log.info("document.done", { chunkCount: chunks.length });
      return { status: "done", chunkCount: chunks.length };
    } catch (err) {
      const errorCode = errorCodeOf(err);
      const message = err instanceof Error ? err.message : String(err);

      if (isRetryable(err)) {
        // 交给 BullMQ 退避重试;仅在最后一次尝试落库为 failed。
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade + 1 >= attempts) {
          const notification = await repo.markFailed({
            documentId,
            processingVersion,
            jobIdempotencyKey,
            errorCode,
            errorMessage: message,
          });
          await notifyRecipient(notification);
        }
        throw err;
      }

      // 不可重试:落库 failed 并阻止重试。
      const notification = await repo.markFailed({
        documentId,
        processingVersion,
        jobIdempotencyKey,
        errorCode,
        errorMessage: message,
      });
      await notifyRecipient(notification);
      throw new UnrecoverableError(`${errorCode}: ${message}`);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  };
}
