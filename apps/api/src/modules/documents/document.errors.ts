/**
 * 领域错误。app.onError 统一映射为 HTTP 响应（见 app.ts）。
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super("validation_error", message, 400);
  }
}

export class QuotaExceededError extends DomainError {
  constructor(message = "storage quota exceeded") {
    super("quota_exceeded", message, 413);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "not found") {
    super("not_found", message, 404);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "forbidden") {
    super("forbidden", message, 403);
  }
}

export class UploadNotFoundError extends DomainError {
  constructor(message = "uploaded object not found in storage") {
    super("upload_not_found", message, 400);
  }
}
