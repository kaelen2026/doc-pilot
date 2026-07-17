import { isAllowedMimeType, MAX_FILE_BYTES } from "@doc-pilot/contracts";
import { ValidationError } from "./document.errors";

export interface CreateUploadInput {
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string;
}

/**
 * 解析并校验创建上传请求体（形状校验）。
 */
export function parseCreateUpload(body: unknown): CreateUploadInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("request body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.filename !== "string" || b.filename.trim() === "") {
    throw new ValidationError("filename is required");
  }
  if (typeof b.contentType !== "string") {
    throw new ValidationError("contentType is required");
  }
  if (typeof b.sizeBytes !== "number") {
    throw new ValidationError("sizeBytes must be a number");
  }
  const checksum = typeof b.checksumSha256 === "string" ? b.checksumSha256 : undefined;
  return {
    filename: b.filename,
    contentType: b.contentType,
    sizeBytes: b.sizeBytes,
    checksumSha256: checksum,
  };
}

/**
 * 业务约束校验（格式 + 大小）。返回错误信息或 null。纯函数，便于单测。
 * 这是三处校验中的「API 创建上传」一环（见 product/overview.md §2.2）。
 */
export function validateUploadConstraints(input: {
  contentType: string;
  sizeBytes: number;
}): string | null {
  if (!isAllowedMimeType(input.contentType)) {
    return `unsupported content type: ${input.contentType}`;
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return "sizeBytes must be a positive number";
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    return `file too large: ${input.sizeBytes} > ${MAX_FILE_BYTES}`;
  }
  return null;
}
