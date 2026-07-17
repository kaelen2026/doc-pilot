# ADR-004：BullMQ 异步处理

**状态**：Accepted

## 背景

PDF 解析、清洗、切片、Embedding、摘要都是耗时且可能失败的操作，不适合在 HTTP 请求周期内同步完成。需要重试、幂等、并发控制与独立进程部署能力。

## 决策

使用 BullMQ（基于 Redis）作为任务队列，Worker 作为独立常驻进程消费。MVP 划分三个队列：`document-processing`、`ai-generation`、`maintenance`。

- Job ID 使用稳定幂等键（如 `document:{id}:version:{v}:parse`），重复发布不创建新 Job。
- 外部 AI 调用重试 5 次、指数退避、20% jitter。
- 区分可重试错误（超时、429、瞬时连接错误）与不可重试错误（无效/加密 PDF、超页数）。

## 后果

- HTTP 层快速返回，处理异步进行，状态可观察。
- Worker 不能部署为短生命周期 Serverless Function。
- 需配合 Outbox（ADR-005）保证任务不丢失。

## 参见

- [处理管线 · 异步任务设计](../architecture/pipeline.md#12-异步任务设计)
- [部署方案](../architecture/cross-cutting.md#34-部署方案)
