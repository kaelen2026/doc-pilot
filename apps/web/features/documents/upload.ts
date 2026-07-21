import { type CreateUploadResponse, isAllowedMimeType, MAX_FILE_BYTES } from "@doc-pilot/contracts";
import { apiFetch, errorMessage } from "@/lib/api-client";

// 前端预校验是「三处校验」的前端一环(product/overview.md §2.2);限额常量与响应类型
// 均取自 @doc-pilot/contracts,与 API/Worker 单一真相源,不再手抄。API 创建上传与
// Worker 解析会再次权威校验,前端仅用于即时反馈。
const MAX_FILE_MB = Math.round(MAX_FILE_BYTES / 1024 / 1024);

/** 前端预校验:格式 + 大小。通过返回 null,否则返回中文错误信息。 */
export function validateFile(file: File): string | null {
  if (!isAllowedMimeType(file.type)) {
    return "仅支持 PDF 文件";
  }
  if (file.size <= 0) {
    return "文件为空";
  }
  if (file.size > MAX_FILE_BYTES) {
    return `文件超过 ${MAX_FILE_MB}MB 上限`;
  }
  return null;
}

/** 用浏览器原生 WebCrypto 算文件内容的 SHA256(hex),作为内容去重的客户端指纹。 */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 客户端直传(ADR-003)三步:
 * 1. POST /documents 创建文档并取预签名 PUT URL(带内容指纹,命中去重则短路);
 * 2. 直接 PUT 到对象存储(浏览器 → MinIO/S3);
 * 3. POST /documents/:id/complete-upload 确认并入队解析。
 *
 * 内容去重(§23.4):上传前算 SHA256 随创建请求发出;若同 workspace 已有相同内容的就绪文档,
 * 后端直接返回该文档(不带 upload),前端跳过直传与确认,deduplicated 置 true。
 */
export async function uploadDocument(
  file: File,
): Promise<{ documentId: string; deduplicated: boolean }> {
  const checksumSha256 = await sha256Hex(file);

  const createRes = await apiFetch(`/documents`, {
    method: "POST",
    json: {
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      checksumSha256,
    },
  });
  if (!createRes.ok) {
    throw new Error(await errorMessage(createRes));
  }
  const { document, upload, duplicate } = (await createRes.json()) as CreateUploadResponse;

  // 内容去重命中:已有就绪文档,无需上传。
  if (duplicate || !upload) {
    return { documentId: document.id, deduplicated: true };
  }

  const putRes = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`直传存储失败(HTTP ${putRes.status})`);
  }

  const completeRes = await apiFetch(`/documents/${document.id}/complete-upload`, {
    method: "POST",
  });
  if (!completeRes.ok) {
    throw new Error(await errorMessage(completeRes));
  }
  return { documentId: document.id, deduplicated: false };
}
