/**
 * 通用领域错误契约。app.onError 统一按 status 映射为 HTTP 响应(见 app.ts)。
 *
 * 放在 shared 而非某个业务模块:错误码 → HTTP 状态的映射是全 API 的横切契约,
 * conversations / quota / documents 等模块都依赖它。放进 documents 会让其它模块
 * 反向依赖 documents(见 ADR / 架构体检)。业务模块专属的错误(如 upload)仍留在
 * 各自模块,继承这里的 DomainError。
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
