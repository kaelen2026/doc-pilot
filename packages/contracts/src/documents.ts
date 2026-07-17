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
