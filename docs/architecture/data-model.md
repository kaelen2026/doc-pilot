# 数据模型与存储

## 8. 数据库设计

### 8.1 枚举

建议数据库中使用字符串字段，不使用 PostgreSQL ENUM。原因是字符串加约束更容易迁移。

**document_status**

```
pending_upload
uploaded
queued
processing
ready
partially_ready
failed
deleting
deleted
```

**processing_stage**

```
validate
parse
clean
chunk
embed
summarize
finalize
delete
```

**job_status**

```
pending
running
retrying
completed
failed
cancelled
```

### 8.2 documents

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL,
  current_stage VARCHAR(32),
  progress INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER,
  text_length INTEGER,
  chunk_count INTEGER,
  summary JSONB,
  processing_version INTEGER NOT NULL DEFAULT 1,
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_documents_workspace_created
ON documents(workspace_id, created_at DESC)
WHERE deleted_at IS NULL;
```

`summary` 第一版可以使用 JSONB：

```json
{
  "overview": "……",
  "keyPoints": ["……"],
  "topics": ["……"]
}
```

### 8.3 document_files

```sql
CREATE TABLE document_files (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL,
  kind VARCHAR(32) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  bucket VARCHAR(255) NOT NULL,
  object_key VARCHAR(1024) NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum_sha256 VARCHAR(64),
  content_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(provider, bucket, object_key)
);
```

`kind`：`original`、`extracted_text`、`thumbnail`、`page_image`。

### 8.4 document_chunks

```sql
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  document_id UUID NOT NULL,
  processing_version INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  token_count INTEGER NOT NULL,
  page_start INTEGER,
  page_end INTEGER,
  section_path JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  embedding VECTOR(1536),
  embedding_model VARCHAR(100),
  embedding_version VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(document_id, processing_version, chunk_index)
);
```

保留 `workspace_id` 是为了向量检索时直接执行租户过滤。

向量索引：

```sql
CREATE INDEX idx_chunks_embedding_hnsw
ON document_chunks
USING hnsw (embedding vector_cosine_ops);
```

MVP 中数据量小，也可以先不创建 HNSW，确认数据规模后增加。

### 8.5 processing_jobs

```sql
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  document_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  stage VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  payload JSONB NOT NULL,
  result JSONB,
  error_code VARCHAR(100),
  error_message TEXT,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(idempotency_key)
);
```

### 8.6 conversations

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  document_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
```

### 8.7 messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  client_request_id VARCHAR(100),
  generation_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(conversation_id, client_request_id)
);
```

### 8.8 citations

```sql
CREATE TABLE citations (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL,
  document_id UUID NOT NULL,
  document_chunk_id UUID NOT NULL,
  quote TEXT NOT NULL,
  page_start INTEGER,
  page_end INTEGER,
  score NUMERIC(8, 6),
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
```

### 8.9 ai_generations

```sql
CREATE TABLE ai_generations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  user_id UUID,
  document_id UUID,
  capability VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_id VARCHAR(100),
  prompt_version VARCHAR(50),
  status VARCHAR(30) NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  cost_micros BIGINT,
  latency_ms INTEGER,
  time_to_first_token_ms INTEGER,
  trace_id VARCHAR(100) NOT NULL,
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);
```

### outbox_events

> Transactional Outbox 的表设计与用法见 [处理管线 · Transactional Outbox](pipeline.md#11-transactional-outbox)。

## 9. 对象存储设计

### 9.1 Object Key

不要使用用户文件名直接作为 Key。

推荐：

```
workspaces/{workspaceId}/documents/{documentId}/v{version}/original.pdf
```

派生文件：

```
workspaces/{workspaceId}/documents/{documentId}/v{version}/extracted.json
workspaces/{workspaceId}/documents/{documentId}/v{version}/pages/1.png
```

### 9.2 Bucket

第一版一个私有 Bucket 即可：`docpilot-private`。

所有对象禁止公开访问。读取通过：API 代理、临时签名 URL。

### 9.3 上传策略

```
POST /documents
  ↓
创建 pending_upload Document
  ↓
生成 PUT Presigned URL
  ↓
客户端直传
  ↓
POST /documents/:id/complete-upload
```

上传 URL 建议 10～15 分钟过期。
