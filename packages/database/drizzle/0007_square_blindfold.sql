-- Embedding 维度 1536 → 1024(默认模型切到 bge-m3,EMBEDDING_VERSION v1→v2)。
-- 旧维度向量无法原地转换,且 HNSW 索引依赖该列:先删索引 → 置空旧向量并改维度 → 重建索引。
-- 置空的向量由文档重处理(embedding_version 不匹配触发重建)重新生成。
DROP INDEX IF EXISTS "idx_chunks_embedding_hnsw";--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "embedding" SET DATA TYPE vector(1024) USING NULL;--> statement-breakpoint
CREATE INDEX "idx_chunks_embedding_hnsw" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);
