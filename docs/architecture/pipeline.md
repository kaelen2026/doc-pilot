# 处理管线

涵盖上传 API、Transactional Outbox、异步任务、文档状态机、PDF 解析、Chunk、Embedding 与删除流程。故障恢复见 [runbooks/failure-recovery.md](../runbooks/failure-recovery.md)。

## 10. 上传 API

### 10.1 创建上传任务

`POST /api/v1/documents`

请求：

```json
{
  "filename": "architecture.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 10485760,
  "checksumSha256": "optional"
}
```

处理顺序：

```
验证 Session
  ↓
解析 Workspace
  ↓
检查上传权限
  ↓
检查格式与大小
  ↓
检查用户配额
  ↓
数据库创建 Document
  ↓
生成 Presigned URL
  ↓
返回
```

响应：

```json
{
  "document": { "id": "uuid", "status": "pending_upload" },
  "upload": {
    "method": "PUT",
    "url": "...",
    "headers": { "Content-Type": "application/pdf" },
    "expiresAt": "2026-07-17T20:15:00Z"
  }
}
```

### 10.2 确认上传

`POST /api/v1/documents/:id/complete-upload`

处理：

1. 授权检查。
2. 对 Object Storage 执行 HEAD。
3. 确认对象存在。
4. 校验大小。
5. 校验 Content-Type。
6. 可选校验 Checksum。
7. 在事务中更新 Document。
8. 写入 Outbox Event。
9. 返回 `queued`。

## 11. Transactional Outbox

核心问题：

```
数据库事务提交成功
但 Redis 队列发布失败
```

此时文档已经是 `queued`，但 Worker 永远收不到任务。推荐增加 Outbox。

### 11.1 outbox_events

```sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ
);
```

完成上传时，在同一个事务中：

```
更新 Document
+
创建 ProcessingJob
+
写入 OutboxEvent
```

独立 Publisher 定时读取 Outbox。领取阶段使用短事务：

```sql
SELECT ... FOR UPDATE SKIP LOCKED
```

事务内把事件标记为 `publishing` 并释放行锁，随后在事务外发布 BullMQ，成功后再标记
`published`。Redis 故障时恢复为 `pending`；稳定 Job ID 保证“发布成功但确认失败”的重试不会
产生重复 Job。Publisher 崩溃后，超过租约时间的 `publishing` 会被重新领取。未知事件或非法
payload 标记 `failed` 并保留错误，避免协议不兼容时丢事件。这样同时保证：**业务状态和待发布
事件原子提交**，且外部队列延迟不会长期占用数据库事务。

`status` 取值为 `pending`、`publishing`、`published`、`failed`。

## 12. 异步任务设计

### 12.1 队列划分

MVP 使用三个队列：`document-processing`、`ai-generation`、`maintenance`。

- **document-processing**：parse、clean、chunk、embed、finalize
- **ai-generation**：summarize、answer、rerank
- **maintenance**：cleanup-upload、delete-document、reconcile-jobs、cleanup-orphans

不建议每个任务类型单独创建一个队列。

### 12.2 Job ID

BullMQ Job ID 应使用稳定幂等键：

```
document:{documentId}:version:{version}:parse
document:{documentId}:version:{version}:embed
```

同一版本任务重复发布时，不创建新 Job。

### 12.3 重试策略

外部 AI API：

```
attempts: 5
backoff: exponential
base delay: 2s
jitter: 20%
```

PDF 格式错误不应重试。错误分类：

```
Retryable
├── Provider timeout
├── 429 rate limit
├── Redis transient error
├── Database connection error
└── Object storage temporary error

Non-retryable
├── Invalid PDF
├── Encrypted PDF
├── Unsupported file
├── Exceeds page limit
└── Invalid configuration
```

## 13. 文档状态机

推荐业务状态与处理阶段分离。

```
status:
pending_upload
uploaded
queued
processing
ready
partially_ready
failed
deleting
deleted

current_stage:
validate
parse
clean
chunk
embed
summarize
finalize
```

状态转换：

```
pending_upload → uploaded → queued → processing → ready
```

失败：

```
queued / processing → failed
```

部分成功：

```
Embedding 完成
摘要失败
  → partially_ready
```

此时允许问答，但摘要显示生成失败。

## 14. PDF 解析方案

### 14.1 Parser 抽象

```ts
interface DocumentParser {
  supports(input: { mimeType: string }): boolean;
  parse(input: { filePath: string }): Promise<ParsedDocument>;
}
```

输出：

```ts
interface ParsedDocument {
  metadata: {
    title?: string;
    author?: string;
    pageCount: number;
  };
  pages: Array<{
    pageNumber: number;
    blocks: Array<{
      type: "heading" | "paragraph" | "list" | "table";
      text: string;
      bbox?: number[];
    }>;
  }>;
}
```

第一版不要求完美还原 PDF 排版，但必须保存页码信息。

### 14.2 临时文件

Worker 下载 PDF 后写入临时目录：

```
/tmp/docpilot/{jobId}/original.pdf
```

处理完成后在 `finally` 中清理。需要限制：单任务最大磁盘空间、Worker 并发数、临时目录生命周期。

### 14.3 文本清洗

清洗步骤：

1. Unicode 标准化。
2. 删除空白页。
3. 合并断行。
4. 保留段落边界。
5. 识别重复页眉页脚。
6. 删除连续重复文本。
7. 保留页码映射。
8. 生成内容 Hash。

不要清洗掉所有换行，否则章节结构会丢失。

## 15. Chunk 策略

### 15.1 分层切片

优先级：

```
章节标题 → 段落 → 句子 → Token 硬切分
```

推荐参数：

```
targetTokens = 700
maxTokens = 1000
overlapTokens = 120
minTokens = 100
```

### 15.2 Chunk 元数据

```json
{
  "sectionPath": ["第 3 章", "3.2 身份认证"],
  "pageStart": 12,
  "pageEnd": 13,
  "chunkIndex": 24,
  "parserVersion": "pdf-v1",
  "chunkerVersion": "semantic-v1"
}
```

### 15.3 内容 Hash

系统里有两类 Hash，用途不同，勿混：

1. **原始文件 checksum**：`SHA256(原始文件字节)`。由 Worker 从对象存储下载的真实字节计算（不信前端，见 ADR-003），写入 `document_files.checksum_sha256`，并冗余到 `documents.checksum_sha256`（为按 workspace 建去重索引）。用途：**内容级去重**（见 §23.4、rag.md）——同一 workspace 内相同内容的文件不重复 parse + embed。
2. **Chunk 内容 Hash**：`SHA256(chunk 归一化文本)`，写入 `document_chunks.content_hash`。用途：**检索结果去重**（同一段落被多次召回时只保留一条）。

```
SHA256(normalized content)
```

> 说明：清洗阶段还会算一个 `SHA256(归一化全文)`（`CleanedDocument.contentHash`），原设计用于「判断解析结果是否变化 / 增量更新」，当前实现尚未消费该值，留待增量重处理时启用。

## 16. Embedding 方案

### 16.1 接口

```ts
interface EmbeddingService {
  embedTexts(input: {
    texts: string[];
    model?: string;
  }): Promise<{
    vectors: number[][];
    usage: { inputTokens: number };
  }>;
}
```

### 16.2 批处理

推荐每批 32～100 个 Chunk，按 Token 总量限制。不能只按 Chunk 数批处理，因为不同 Chunk 长度不同。

### 16.3 写入一致性

每一批 Embedding：

```
调用 Provider
  ↓
验证返回向量数量
  ↓
验证维度
  ↓
事务更新对应 Chunk
```

如果返回数量不一致，整批不写入。

## 24. 删除流程

删除必须异步执行。

### 24.1 API

`DELETE /api/v1/documents/:id`

立即执行：

```
Document → deleting
deleted_at = now
拒绝新问答
创建 delete job
```

Worker：

1. 删除 Chunk。
2. 删除向量。
3. 删除 Citation。
4. 删除 Conversation。
5. 删除派生文件。
6. 删除原始文件。
7. 标记 `deleted`。

使用 `processing_version` 防止旧任务回写。Worker 写入前验证：

```
document.status != deleting
document.processing_version == job.processingVersion
```
