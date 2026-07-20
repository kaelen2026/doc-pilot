import { db } from "@doc-pilot/database";
import { documentFiles, documents, outboxEvents, processingJobs } from "@doc-pilot/database/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

export type DocumentRow = typeof documents.$inferSelect;

/**
 * 租户作用域的 documents 域数据访问(ADR-008,与 scopedConversationRepo 同范式)。
 *
 * 入口拿到已鉴权的 workspaceId 后构造一次,之后所有读写自动注入 `workspace_id` 过滤——
 * 租户边界藏在这个 seam 背后,调用方签名里不再散落 workspaceId,新增方法也漏不掉。
 * 这取代了原先「每个自由函数手传 workspaceId」的写法:那种写法下漏传一处即越权
 * (findByOwnerIdempotency 曾因此可跨 workspace 串号,见架构体检 E)。
 */
export function scopedDocumentRepo(workspaceId: string) {
  return {
    /** 创建幂等（§23.1）：同一 workspace + owner + Idempotency-Key 命中同一文档(租户内)。 */
    async findByOwnerIdempotency(
      ownerId: string,
      idempotencyKey: string,
    ): Promise<DocumentRow | undefined> {
      const [row] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.ownerId, ownerId),
            eq(documents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return row;
    },

    /**
     * 内容去重的快速通道查找（§23.4）：同一 workspace 内是否已有相同内容且「可用」的文档。
     * 只匹配 ready / partially_ready（已产出 chunk 可问答）——在途/失败的不算,避免把新上传
     * 挂到一份最终会失败的文档上。
     */
    async findReadyByChecksum(
      checksumSha256: string,
    ): Promise<{ id: string; status: string } | undefined> {
      const [row] = await db
        .select({ id: documents.id, status: documents.status })
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.checksumSha256, checksumSha256),
            inArray(documents.status, ["ready", "partially_ready"]),
            isNull(documents.deletedAt),
          ),
        )
        .limit(1);
      return row;
    },

    async insertDocument(values: {
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
          workspaceId,
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
    },

    async findById(id: string): Promise<DocumentRow | undefined> {
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
    },

    /**
     * 文档处理状态(状态可观察,见 pipeline.md §13)。按 workspaceId 过滤实现租户隔离。
     */
    async getStatusById(id: string) {
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
    },

    async list() {
      return db
        .select({
          id: documents.id,
          title: documents.title,
          status: documents.status,
          currentStage: documents.currentStage,
          progress: documents.progress,
          sizeBytes: documents.sizeBytes,
          pageCount: documents.pageCount,
          // 失败原因码：前端据此展示人话提示(如扫描件不支持)。errorMessage 偏技术,
          // 列表不带,详情接口(getStatusById)已含。
          errorCode: documents.errorCode,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(and(eq(documents.workspaceId, workspaceId), isNull(documents.deletedAt)))
        .orderBy(desc(documents.createdAt));
    },

    /**
     * 确认上传的原子写入（Transactional Outbox，见 ADR-005 / pipeline.md §11）：
     * 在同一事务内更新 Document、创建 DocumentFile、创建 ProcessingJob（幂等键唯一）、
     * 写入 OutboxEvent。若文档已非 pending/uploaded 状态，则视为重复确认，直接返回。
     * 行锁与状态流转的查询本身也带 workspace_id,事务内自证租户边界(不依赖调用方先校)。
     */
    async completeUploadTx(params: {
      documentId: string;
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
          .where(and(eq(documents.id, params.documentId), eq(documents.workspaceId, workspaceId)))
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
          .where(and(eq(documents.id, params.documentId), eq(documents.workspaceId, workspaceId)))
          .returning();

        await tx
          .insert(processingJobs)
          .values({
            workspaceId,
            documentId: params.documentId,
            type: "process_document",
            stage: "parse",
            status: "pending",
            idempotencyKey: params.jobIdempotencyKey,
            payload: {
              documentId: params.documentId,
              workspaceId,
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
            workspaceId,
            processingVersion: params.processingVersion,
            jobIdempotencyKey: params.jobIdempotencyKey,
          },
        });

        return { document: updated ?? current, alreadyQueued: false };
      });
    },
  };
}

export type ScopedDocumentRepo = ReturnType<typeof scopedDocumentRepo>;
