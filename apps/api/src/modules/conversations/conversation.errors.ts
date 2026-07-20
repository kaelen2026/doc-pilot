import type { CitationIssue } from "@doc-pilot/ai";
import { DomainError } from "../../shared/errors";

export class ConflictError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message, 409);
  }
}

/**
 * 引用业务校验未通过(ADR-007:全部通过才允许落库)。
 * 发生在 SSE 流已开始之后,不映射 HTTP 状态,由路由转成 message.failed 事件。
 */
export class AnswerRejectedError extends Error {
  readonly code = "CITATION_VALIDATION_FAILED";

  constructor(readonly issues: CitationIssue[]) {
    super(`引用校验未通过:${issues.map((i) => i.code).join(", ")}`);
    this.name = "AnswerRejectedError";
  }
}
