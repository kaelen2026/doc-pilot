import { DomainError } from "../../shared/errors";

/**
 * documents 模块专属错误。通用领域错误(DomainError/ValidationError/NotFoundError…)
 * 已上移到 shared/errors,业务模块从那里 import;此处只保留 upload 领域特有的错误。
 */
export class UploadNotFoundError extends DomainError {
  constructor(message = "uploaded object not found in storage") {
    super("upload_not_found", message, 400);
  }
}

export class DocumentNotPublishableError extends DomainError {
  constructor() {
    super("DOCUMENT_NOT_PUBLISHABLE", "document is not ready to publish", 409);
  }
}
