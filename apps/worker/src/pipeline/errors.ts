import { PROCESSING_ERROR_CODES, type ProcessingErrorCode } from "@doc-pilot/contracts";

/**
 * 流水线错误。区分可重试(瞬时故障)与不可重试(内容/配置问题),
 * 决定 BullMQ 是否退避重试(见 pipeline.md §12.3)。
 */
export class PipelineError extends Error {
  readonly code: ProcessingErrorCode;
  readonly retryable: boolean;

  constructor(code: ProcessingErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.retryable = retryable;
  }

  static nonRetryable(code: ProcessingErrorCode, message: string): PipelineError {
    return new PipelineError(code, message, false);
  }

  static retryable(code: ProcessingErrorCode, message: string): PipelineError {
    return new PipelineError(code, message, true);
  }
}

/**
 * 判断任意异常是否应重试。
 * - PipelineError 以自身标记为准。
 * - 未知异常默认可重试(视为瞬时故障);BullMQ 的 attempts 上限兜底,避免无限重试。
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof PipelineError) {
    return err.retryable;
  }
  return true;
}

export function errorCodeOf(err: unknown): ProcessingErrorCode {
  if (err instanceof PipelineError) {
    return err.code;
  }
  return PROCESSING_ERROR_CODES.INTERNAL;
}
