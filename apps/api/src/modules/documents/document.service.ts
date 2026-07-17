import { buildParseJobId } from "@doc-pilot/contracts";
import {
  bucket,
  buildOriginalObjectKey,
  createPresignedPutUrl,
  headObject,
} from "@doc-pilot/storage";
import { assertUploadQuota } from "../quota/quota.service";
import { NotFoundError, UploadNotFoundError, ValidationError } from "./document.errors";
import * as repo from "./document.repository";
import { type CreateUploadInput, validateUploadConstraints } from "./document.schema";

const PROVIDER = "s3";

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "") || filename;
}

export interface CreateUploadResult {
  document: { id: string; status: string };
  upload: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
}

export async function createUpload(params: {
  workspaceId: string;
  ownerId: string;
  idempotencyKey?: string;
  input: CreateUploadInput;
}): Promise<CreateUploadResult> {
  const constraintError = validateUploadConstraints(params.input);
  if (constraintError) {
    throw new ValidationError(constraintError);
  }

  // 配额检查（在昂贵操作之前，见 cross-cutting.md §27.2）:存储字节 + 文档数量。
  await assertUploadQuota({
    workspaceId: params.workspaceId,
    additionalBytes: params.input.sizeBytes,
  });

  // 创建幂等（§23.1）：同一 owner + Idempotency-Key 复用已有文档。
  let document = params.idempotencyKey
    ? await repo.findByOwnerIdempotency(params.ownerId, params.idempotencyKey)
    : undefined;

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
