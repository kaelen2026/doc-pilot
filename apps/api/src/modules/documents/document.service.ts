import { buildParseJobId, type CreateUploadResponse } from "@doc-pilot/contracts";
import {
  bucket,
  buildOriginalObjectKey,
  createPresignedGetUrl,
  createPresignedPutUrl,
  headObject,
} from "@doc-pilot/storage";
import { NotFoundError, ValidationError } from "../../shared/errors";
import { assertUploadQuota } from "../quota/quota.service";
import { UploadNotFoundError } from "./document.errors";
import * as repo from "./document.repository";
import { type CreateUploadInput, validateUploadConstraints } from "./document.schema";

const PROVIDER = "s3";

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "") || filename;
}

export async function createUpload(params: {
  workspaceId: string;
  ownerId: string;
  idempotencyKey?: string;
  input: CreateUploadInput;
}): Promise<CreateUploadResponse> {
  const constraintError = validateUploadConstraints(params.input);
  if (constraintError) {
    throw new ValidationError(constraintError);
  }

  // 创建幂等（§23.1）：同一 workspace + owner + Idempotency-Key 复用已有文档（重试语义,优先于内容去重）。
  let document = params.idempotencyKey
    ? await repo.findByOwnerIdempotency(params.workspaceId, params.ownerId, params.idempotencyKey)
    : undefined;

  // 内容去重快速通道（§23.4）：仅对全新创建生效——命中同 workspace 已就绪的相同内容文档时,
  // 直接返回该文档,既不新建、不签发上传 URL,也不占配额。客户端指纹仅作提示,权威指纹由
  // Worker 从真实字节计算(见 ADR-003);未带指纹或错报的上传由 Worker 侧兜底去重。
  if (!document && params.input.checksumSha256) {
    const dup = await repo.findReadyByChecksum(params.workspaceId, params.input.checksumSha256);
    if (dup) {
      return { document: { id: dup.id, status: dup.status }, duplicate: true };
    }
  }

  // 配额检查（在昂贵操作之前，见 cross-cutting.md §27.2）:存储字节 + 文档数量。
  await assertUploadQuota({
    workspaceId: params.workspaceId,
    additionalBytes: params.input.sizeBytes,
  });

  if (!document) {
    document = await repo.insertDocument({
      workspaceId: params.workspaceId,
      ownerId: params.ownerId,
      title: titleFromFilename(params.input.filename),
      originalFilename: params.input.filename,
      mimeType: params.input.contentType,
      sizeBytes: params.input.sizeBytes,
      idempotencyKey: params.idempotencyKey,
    });
  }

  const objectKey = buildOriginalObjectKey({
    workspaceId: params.workspaceId,
    documentId: document.id,
    version: document.processingVersion,
  });

  const { url, expiresAt } = await createPresignedPutUrl({
    key: objectKey,
    contentType: params.input.contentType,
  });

  return {
    document: { id: document.id, status: document.status },
    upload: {
      method: "PUT",
      url,
      headers: { "Content-Type": params.input.contentType },
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function completeUpload(params: {
  workspaceId: string;
  documentId: string;
}): Promise<{ document: { id: string; status: string }; alreadyQueued: boolean }> {
  const document = await repo.findByIdInWorkspace(params.documentId, params.workspaceId);
  if (!document) {
    throw new NotFoundError("document not found");
  }

  // 已确认过：幂等返回，不再 HEAD / 建任务。
  if (document.status !== "pending_upload" && document.status !== "uploaded") {
    return { document: { id: document.id, status: document.status }, alreadyQueued: true };
  }

  const objectKey = buildOriginalObjectKey({
    workspaceId: params.workspaceId,
    documentId: document.id,
    version: document.processingVersion,
  });

  const head = await headObject(objectKey);
  if (!head) {
    throw new UploadNotFoundError();
  }

  const contentType = head.contentType ?? document.mimeType;
  const constraintError = validateUploadConstraints({ contentType, sizeBytes: head.sizeBytes });
  if (constraintError) {
    throw new ValidationError(constraintError);
  }

  const result = await repo.completeUploadTx({
    documentId: document.id,
    workspaceId: params.workspaceId,
    processingVersion: document.processingVersion,
    sizeBytes: head.sizeBytes,
    provider: PROVIDER,
    bucket,
    objectKey,
    contentType,
    jobIdempotencyKey: buildParseJobId(document.id, document.processingVersion),
  });

  return {
    document: { id: result.document.id, status: result.document.status },
    alreadyQueued: result.alreadyQueued,
  };
}

/**
 * 在线阅读:签发原始 PDF 的 GET Presigned URL。租户隔离在查询里按 workspaceId 过滤;
 * 原文件在上传完成后才存在,故 pending_upload 无文件可读。软删除中/已删同样拒绝。
 */
export async function getFileUrl(params: { workspaceId: string; documentId: string }) {
  const document = await repo.findByIdInWorkspace(params.documentId, params.workspaceId);
  if (!document) {
    throw new NotFoundError("document not found");
  }
  if (document.status === "pending_upload") {
    throw new UploadNotFoundError();
  }

  const objectKey = buildOriginalObjectKey({
    workspaceId: params.workspaceId,
    documentId: document.id,
    version: document.processingVersion,
  });
  const { url, expiresAt } = await createPresignedGetUrl({
    key: objectKey,
    filename: document.originalFilename,
  });
  return { url, expiresAt: expiresAt.toISOString() };
}

export async function listDocuments(workspaceId: string) {
  return repo.listByWorkspace(workspaceId);
}

/**
 * 单个文档的处理状态。租户隔离在查询里按 workspaceId 过滤;不存在 → 404。
 */
export async function getDocument(params: { workspaceId: string; documentId: string }) {
  const document = await repo.getStatusById(params.documentId, params.workspaceId);
  if (!document) {
    throw new NotFoundError("document not found");
  }
  return { document };
}
