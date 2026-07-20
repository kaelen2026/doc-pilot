/**
 * 文档业务状态与处理阶段（见 docs/architecture/data-model.md §8.1、pipeline.md §13）。
 * 数据库用 VARCHAR 存储（不用 PG ENUM），此处集中定义合法取值。
 */
export const DOCUMENT_STATUS = [
  "pending_upload",
  "uploaded",
  "queued",
  "processing",
  "ready",
  "partially_ready",
  "failed",
  "deleting",
  "deleted",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

export const PROCESSING_STAGE = [
  "validate",
  "parse",
  "clean",
  "chunk",
  "embed",
  "summarize",
  "finalize",
  "delete",
] as const;
export type ProcessingStage = (typeof PROCESSING_STAGE)[number];

export const JOB_STATUS = [
  "pending",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

/**
 * 创建上传（POST /documents）的请求/响应契约。前后端共享,避免手工对齐漂移。
 * `checksumSha256` 是客户端算出的文件内容指纹,用于内容级去重的「快速通道」:
 * 命中同 workspace 已就绪文档时,响应不带 `upload`、`duplicate` 为 true,前端跳过直传。
 * 客户端指纹仅作提示,权威指纹由 Worker 从真实字节计算(见 ADR-003、pipeline.md §15.3)。
 */
export interface CreateUploadRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string;
}

export interface UploadTarget {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface CreateUploadResponse {
  document: { id: string; status: string };
  /** 正常新建上传时存在;内容去重命中已有文档时缺省。 */
  upload?: UploadTarget;
  /** 命中同 workspace 已有相同内容文档:未新建、无需上传,document 指向已有文档。 */
  duplicate?: boolean;
}
