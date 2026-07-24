// 处理失败原因码 → 面向用户的人话。错误码见 @doc-pilot/contracts PROCESSING_ERROR_CODES
// 与 docs/architecture/pipeline.md §12.3。此处只做展示映射,不引服务端契约包。
const FAILURE_REASON: Record<string, string> = {
  EMPTY_DOCUMENT: "扫描件或图片型 PDF,无法提取文字(暂不支持 OCR)",
  ENCRYPTED_PDF: "PDF 有密码保护,请上传未加密的版本",
  INVALID_PDF: "PDF 文件损坏或无法解析",
  UNSUPPORTED_FILE: "不支持的文件类型,仅支持 PDF",
  FILE_SIZE_LIMIT_EXCEEDED: "文件大小超过上限(50MB)",
  PAGE_LIMIT_EXCEEDED: "页数超过上限(500 页)",
  CHUNK_LIMIT_EXCEEDED: "文档内容过多,超过处理上限",
  INVALID_CONFIGURATION: "处理配置异常,请联系支持",
};

// 瞬时/内部类错误:提示可重试,不暴露技术细节。
const RETRYABLE_HINT = "处理失败,请稍后重试";
const RETRYABLE_CODES = new Set([
  "EMBEDDING_FAILED",
  "STORAGE_UNAVAILABLE",
  "DATABASE_ERROR",
  "INTERNAL",
]);

/** 把失败原因码翻成人话;未知或缺失一律回落到通用文案。 */
export function failureReason(errorCode: string | null | undefined): string {
  if (!errorCode) {
    return "处理失败";
  }
  if (RETRYABLE_CODES.has(errorCode)) {
    return RETRYABLE_HINT;
  }
  return FAILURE_REASON[errorCode] ?? "处理失败";
}
