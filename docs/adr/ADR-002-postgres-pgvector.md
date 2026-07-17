# ADR-002：PostgreSQL + pgvector

**状态**：Accepted

## 背景

RAG 需要向量检索能力。可选方案包括独立向量数据库（如 Pinecone、Qdrant、Weaviate）或在现有关系库中扩展向量能力。MVP 数据量小，且需要向量检索与业务数据（租户、文档、版本）做联合过滤。

## 决策

使用 PostgreSQL 16+ 搭配 pgvector 扩展，在同一数据库中存储业务数据与向量。检索时在数据库查询内完成租户与文档过滤：

```sql
WHERE workspace_id = $2 AND document_id = $3 AND processing_version = $4
ORDER BY embedding <=> $1
```

向量索引采用 HNSW（`vector_cosine_ops`），MVP 数据量小可先不建索引，确认规模后再加。

## 后果

- 单库事务保证向量与业务数据一致，避免跨系统同步。
- 租户隔离直接在 SQL 中强制执行。
- 大规模场景下需重新评估是否引入独立向量数据库（列入"第一版明确不做"）。

## 参见

- [数据模型 · document_chunks](../architecture/data-model.md#84-document_chunks)
- [RAG · 向量检索](../architecture/rag.md#17-向量检索)
