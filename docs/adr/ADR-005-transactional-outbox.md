# ADR-005：Transactional Outbox

**状态**：Accepted

## 背景

存在双写不一致风险：数据库事务提交成功，但随后向 Redis/BullMQ 发布任务失败。此时文档已是 `queued`，Worker 却永远收不到任务，处理永久卡住。

## 决策

引入 Transactional Outbox。完成上传时，在**同一个数据库事务**中：

```
更新 Document + 创建 ProcessingJob + 写入 OutboxEvent
```

独立 Publisher 定时读取 `outbox_events`（`SELECT ... FOR UPDATE SKIP LOCKED`），成功发布到 BullMQ 后标记 `published`。

## 后果

- 业务状态与待发布事件原子提交，任务不丢失。
- 引入 Publisher 组件与 `outbox_events` 表。
- 事件至少投递一次（at-least-once），下游需靠幂等 Job ID 去重。

## 参见

- [处理管线 · Transactional Outbox](../architecture/pipeline.md#11-transactional-outbox)
- [故障恢复 · Reconciliation](../runbooks/failure-recovery.md)
