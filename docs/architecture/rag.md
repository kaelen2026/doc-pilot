# RAG 与 AI

涵盖向量检索、RAG 上下文构建、Prompt 管理、AI Gateway、文档摘要、问答流式接口与幂等性。

## 17. 向量检索

### 17.1 基础查询

```sql
SELECT
  id,
  content,
  page_start,
  page_end,
  section_path,
  1 - (embedding <=> $1) AS score
FROM document_chunks
WHERE workspace_id = $2
  AND document_id = $3
  AND processing_version = $4
  AND embedding IS NOT NULL
ORDER BY embedding <=> $1
LIMIT 20;
```

租户和文档过滤必须发生在数据库查询中。

### 17.2 混合检索

第二阶段增加：

```
Vector Search + PostgreSQL Full Text Search
```

融合可以使用 Reciprocal Rank Fusion：

```
RRF Score = 1 / (k + vectorRank) + 1 / (k + keywordRank)
```

MVP 可先只实现向量检索。

### 17.3 Rerank

第一版可以不使用独立 Reranker 模型。低成本方案：

1. 向量召回 20 个。
2. 根据相似度过滤。
3. 相邻 Chunk 合并。
4. 去除高度重复结果。
5. 取 6～8 个。

第二阶段再增加专用 Reranker。

## 18. RAG 上下文构建

### 18.1 Context Budget

假设模型上下文足够大，也不能无限注入。推荐控制：

```
系统 Prompt：约 500 Tokens
对话历史：最多 2000 Tokens
检索上下文：最多 6000 Tokens
用户问题：实际长度
输出预算：1000～2000 Tokens
```

### 18.2 相邻 Chunk 扩展

如果检索命中某个 Chunk，可补充其前后 Chunk：

```
命中 chunk 20
补充 chunk 19 和 21
```

但要去重，并受 Token Budget 限制。

## 19. Prompt 管理

### 19.1 Prompt 不写死在 Service

建议：

```
packages/ai/prompts/
├── document-summary/
│   ├── v1.ts
│   └── schema.ts
├── document-answer/
│   ├── v1.ts
│   └── schema.ts
└── query-rewrite/
```

Prompt 定义：

```ts
export const documentAnswerPrompt = {
  id: "document-answer",
  version: "1.0.0",
  build(input: DocumentAnswerInput) {
    return {
      system: "...",
      messages: [...]
    };
  }
};
```

### 19.2 输出 Schema

```ts
const AnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      sourceId: z.string(),
      quote: z.string(),
      claim: z.string()
    })
  ),
  insufficientEvidence: z.boolean()
});
```

模型输出通过 Zod 校验后，还要执行业务校验：

- `sourceId` 是否存在
- 是否属于本次 Context
- 是否属于当前文档
- `quote` 是否与原文大致匹配

## 20. AI Gateway

### 20.1 接口设计

```ts
interface AIGateway {
  generateObject<T>(input: {
    capability: string;
    promptId: string;
    promptVersion: string;
    schema: ZodSchema<T>;
    variables: Record<string, unknown>;
    metadata: AIMetadata;
  }): Promise<AIResult<T>>;

  streamText(input: {
    capability: string;
    promptId: string;
    promptVersion: string;
    messages: AIMessage[];
    metadata: AIMetadata;
  }): Promise<AIStreamResult>;

  embed(input: {
    capability: string;
    texts: string[];
    metadata: AIMetadata;
  }): Promise<EmbeddingResult>;
}
```

### 20.2 Gateway 处理链

```
调用方
  ↓
校验 Capability
  ↓
解析 Model Route
  ↓
检查 Quota
  ↓
解析 Prompt Version
  ↓
调用 Provider Adapter
  ↓
记录 Usage
  ↓
记录 Trace
  ↓
标准化错误
  ↓
返回
```

### 20.3 错误标准化

```
AI_RATE_LIMITED
AI_TIMEOUT
AI_PROVIDER_UNAVAILABLE
AI_INVALID_RESPONSE
AI_CONTEXT_TOO_LARGE
AI_CONTENT_BLOCKED
AI_QUOTA_EXCEEDED
```

业务层不处理 Provider 原始错误。

## 21. 文档摘要

### 21.1 小文档

如果总 Token 数低于阈值：全文直接摘要。

### 21.2 大文档

采用 Map-Reduce：

```
每个章节生成局部摘要
  ↓
合并局部摘要
  ↓
生成最终摘要
```

局部摘要输出：

```json
{
  "section": "3.2 Authentication",
  "summary": "...",
  "keyPoints": ["...", "..."]
}
```

最终摘要：

```json
{
  "overview": "...",
  "keyPoints": ["...", "..."],
  "topics": ["...", "..."],
  "questionsWorthAsking": ["...", "..."]
}
```

## 22. 问答流式接口

### 22.1 API

`POST /api/v1/conversations/:id/messages`

请求：

```json
{
  "content": "为什么选择服务端 Session？",
  "clientRequestId": "01J..."
}
```

### 22.2 处理流程

```
鉴权
  ↓
校验 Conversation
  ↓
校验 Document ready
  ↓
幂等检查
  ↓
保存 User Message
  ↓
创建 Assistant Message(pending)
  ↓
检索
  ↓
构造 Prompt
  ↓
流式生成
  ↓
逐段 SSE 输出
  ↓
验证引用
  ↓
保存完整答案和 Citation
  ↓
Assistant Message → completed
```

### 22.3 SSE 事件

```
message.started
retrieval.completed
message.delta
citation
usage
message.completed
message.failed
```

示例：

```
event: retrieval.completed
data: {"sourceCount":6}

event: message.delta
data: {"text":"文档选择服务端 Session 的原因是"}

event: citation
data: {"citationId":"cit_1","pageStart":12}

event: message.completed
data: {"messageId":"msg_2"}
```

## 23. 幂等性

### 23.1 创建文档

客户端提供 `Idempotency-Key`。数据库保存 `user_id + idempotency_key`。重复请求返回同一 Document。

### 23.2 完成上传

唯一约束：`document_id + processing_version + job_type`。

### 23.3 用户提问

唯一约束：`conversation_id + client_request_id`。

用户重复提交时：

- `pending`：返回当前流状态
- `completed`：返回已有消息
- `failed`：允许显式重试
