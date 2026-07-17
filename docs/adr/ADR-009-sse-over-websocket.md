# ADR-009：SSE 而不是 WebSocket

**状态**：Accepted

## 背景

问答需要把模型生成的答案流式返回给客户端，并在过程中推送检索完成、增量文本、引用、用量、完成/失败等事件。

## 决策

问答使用 SSE（Server-Sent Events）而不是 WebSocket。因为当前需求是：

```
客户端请求一次
服务端单向流式返回
```

没有持续双向实时通信需求。SSE 事件包括 `message.started`、`retrieval.completed`、`message.delta`、`citation`、`usage`、`message.completed`、`message.failed`。

## 后果

- 实现更简单，基于标准 HTTP，易于在 Node 运行时统一处理。
- 天然适配 API 的请求/响应模型与中间件。
- 若未来出现双向实时协作需求（列入"第一版明确不做"的实时协同编辑），需重新评估。

## 参见

- [RAG · 问答流式接口](../architecture/rag.md#22-问答流式接口)
