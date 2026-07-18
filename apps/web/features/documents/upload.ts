import { API_URL } from "@/lib/env";

// 前端预校验常量。与 @doc-pilot/contracts 的 MAX_FILE_BYTES / ALLOWED_MIME_TYPES
// 保持一致——这是「三处校验」的前端一环(product/overview.md §2.2);
// API 创建上传与 Worker 解析会再次权威校验,前端仅用于即时反馈。
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
export const ALLOWED_MIME_TYPE = "application/pdf";

/** 前端预校验:格式 + 大小。通过返回 null,否则返回中文错误信息。 */
export function validateFile(file: File): string | null {
  if (file.type !== ALLOWED_MIME_TYPE) {
    return "仅支持 PDF 文件";
  }
  if (file.size <= 0) {
    return "文件为空";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "文件超过 50MB 上限";
  }
  return null;
}

interface CreateUploadResponse {
  document: { id: string; status: string };
  upload: { method: string; url: string; headers: Record<string, string>; expiresAt: string };
}

async function errorMessage(r: Response): Promise<string> {
  const body = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
  return body?.message ?? body?.error ?? `HTTP ${r.status}`;
}

/**
 * 客户端直传(ADR-003)三步:
 * 1. POST /documents 创建文档并取预签名 PUT URL;
 * 2. 直接 PUT 到对象存储(浏览器 → MinIO/S3);
 * 3. POST /documents/:id/complete-upload 确认并入队解析。
 */
export async function uploadDocument(file: File): Promise<{ documentId: string }> {
  const createRes = await fetch(`${API_URL}/documents`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
  });
  if (!createRes.ok) {
    throw new Error(await errorMessage(createRes));
  }
  const { document, upload } = (await createRes.json()) as CreateUploadResponse;

  const putRes = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`直传存储失败(HTTP ${putRes.status})`);
  }

  const completeRes = await fetch(`${API_URL}/documents/${document.id}/complete-upload`, {
    method: "POST",
    credentials: "include",
  });
  if (!completeRes.ok) {
    throw new Error(await errorMessage(completeRes));
  }
  return { documentId: document.id };
}
