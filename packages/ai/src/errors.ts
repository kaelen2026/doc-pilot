/**
 * AI 错误标准化（ADR-006 / rag.md#20.3）。
 * 业务层只处理 AI_* 错误码，绝不接触 Provider 原始错误。
 */
export const AI_ERROR_CODES = [
  "AI_RATE_LIMITED",
  "AI_TIMEOUT",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_INVALID_RESPONSE",
  "AI_CONTEXT_TOO_LARGE",
  "AI_CONTENT_BLOCKED",
  "AI_QUOTA_EXCEEDED",
] as const;

export type AIErrorCode = (typeof AI_ERROR_CODES)[number];

export class AIError extends Error {
  readonly code: AIErrorCode;

  constructor(code: AIErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = "AIError";
    this.code = code;
  }
}

export function isAIError(err: unknown): err is AIError {
  return err instanceof AIError;
}

/**
 * 把 Adapter 抛出的任意错误收敛为 AIError。
 * Adapter 应尽量自己抛 AIError；这里是最后的兜底：未知错误一律视为 Provider 不可用。
 */
export function normalizeAIError(err: unknown): AIError {
  if (isAIError(err)) {
    return err;
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return new AIError("AI_TIMEOUT", err.message, { cause: err });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AIError("AI_PROVIDER_UNAVAILABLE", message, { cause: err });
}
