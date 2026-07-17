/**
 * 文件与配额限制（见 docs/product/overview.md §2.2）。
 * 必须在三处一致执行：前端预校验、API 创建上传、Worker 解析。
 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_PAGES = 500;
export const MAX_CHUNKS_PER_DOCUMENT = 5000;
export const STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024; // 1GB / 用户

export const ALLOWED_MIME_TYPES = ["application/pdf"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}
