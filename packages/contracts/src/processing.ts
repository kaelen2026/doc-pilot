/**
 * 解析流水线的共享常量与错误码（见 docs/architecture/pipeline.md §12–§16）。
 *
 * 这里只放前后端 / API / Worker 都可能引用的稳定契约:
 * - 解析器 / 切片器版本(写入 chunk 元数据,用于判断解析结果是否需要重建)。
 * - Embedding 维度(与 document_chunks.embedding 的向量维度一致)。
 * - 处理错误码 + 可重试分类(Worker 决定是否让 BullMQ 重试)。
 * 具体的切片调参(targetTokens 等)属于 Worker 实现细节,不在契约层。
 */

export const PARSER_VERSION = "pdf-v1";
export const CHUNKER_VERSION = "semantic-v1";

/** 与 document_chunks.embedding 的 vector 维度保持一致(见 rag.md)。 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Embedding 管线版本(写入 document_chunks.embedding_version)。
 * 换 embedding 模型或预处理方式时递增,用于判断已有向量是否需要重建。
 */
export const EMBEDDING_VERSION = "v1";

/**
 * 处理错误码。错误分类见 pipeline.md §12.3:
 * 可重试的是瞬时故障(超时 / 限流 / 依赖抖动),不可重试的是内容 / 配置问题。
 */
export const PROCESSING_ERROR_CODES = {
  // Non-retryable —— 重试也不会变好,直接判失败。
  INVALID_PDF: "INVALID_PDF",
  ENCRYPTED_PDF: "ENCRYPTED_PDF",
  UNSUPPORTED_FILE: "UNSUPPORTED_FILE",
  PAGE_LIMIT_EXCEEDED: "PAGE_LIMIT_EXCEEDED",
  CHUNK_LIMIT_EXCEEDED: "CHUNK_LIMIT_EXCEEDED",
  EMPTY_DOCUMENT: "EMPTY_DOCUMENT",
  INVALID_CONFIGURATION: "INVALID_CONFIGURATION",
  // 可重试与否由 Worker 按底层 AI_* 错误分类(限流/超时可重试,配额/内容类不重试)。
  EMBEDDING_FAILED: "EMBEDDING_FAILED",
  // Retryable —— 瞬时故障,交给 BullMQ 退避重试。
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
  DATABASE_ERROR: "DATABASE_ERROR",
  INTERNAL: "INTERNAL",
} as const;

export type ProcessingErrorCode =
  (typeof PROCESSING_ERROR_CODES)[keyof typeof PROCESSING_ERROR_CODES];

/**
 * BullMQ 重试策略(见 pipeline.md §12.3)。仅在错误被判定为可重试时生效;
 * 不可重试错误在 Worker 里用 UnrecoverableError 立即停住,不消耗重试次数。
 */
export const PROCESSING_RETRY = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
} as const;

/**
 * 自动对账(Reconciliation,见 runbooks/failure-recovery.md §35):周期性扫描卡住
 * 的文档并修复。所有时长以毫秒计。阈值取值宽松,避免与正常快路径 / BullMQ 自身的
 * stalled-job 恢复抢活。
 */
export const RECONCILE = {
  /** 对账周期。 */
  intervalMs: 60_000,
  /** 单轮扫描的文档上限。 */
  batchSize: 200,
  /** queued 停留超过此值仍无存活 BullMQ Job 视为"丢失",重新入队(给 Outbox 发布留缓冲)。 */
  queuedGraceMs: 30_000,
  /** processing 超过此值无阶段进展且无存活 Job,视为 Worker 崩溃,重新入队。 */
  processingStuckMs: 10 * 60_000,
  /** pending_upload 空闲超过此值仍未完成直传,视为用户放弃,标记 failed。 */
  pendingUploadTtlMs: 60 * 60_000,
  /** 处理类文档创建后存活超过此值仍未就绪 → 放弃并标记 failed(防毒丸文档无限重试)。 */
  maxProcessingAgeMs: 60 * 60_000,
} as const;
