/**
 * Drizzle schema.
 *
 * 表结构（documents / document_files / document_chunks / processing_jobs /
 * conversations / messages / citations / ai_generations / outbox_events）
 * 按 docs/architecture/data-model.md 在 Phase 3+ 分批加入。
 *
 * Phase 1 仅打通迁移管线并启用 pgvector 扩展
 * （见 drizzle/0000_enable_pgvector.sql），暂无表定义。
 */
export {};
