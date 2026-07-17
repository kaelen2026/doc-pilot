# 运维手册：故障恢复

异步系统必然出现卡住、超时、孤儿数据等问题。本手册描述自动对账（Reconciliation）与超时任务的恢复机制。

## 35.1 Reconciliation Job

每隔几分钟运行一次，检查并修复以下异常状态：

| 检查项 | 异常含义 | 处理 |
| --- | --- | --- |
| `queued` 但无 BullMQ Job | Outbox 未发布或任务丢失 | 重新入队 |
| `processing` 超时 | Worker 崩溃或卡死 | 重置并重试 / 标记 failed |
| `pending_upload` 超时 | 用户未完成直传 | 清理孤儿 Document 与对象 |
| `deleting` 长时间未完成 | 删除任务卡住 | 重新触发 delete job |
| Outbox 长时间未发布 | Publisher 异常 | 重新发布 |

Reconciliation 属于 `maintenance` 队列（见 [异步任务设计](../architecture/pipeline.md#12-异步任务设计)）。

## 35.2 超时任务

任务启动时设置租约：

```
locked_at
locked_by
lock_expires_at
```

或者使用 BullMQ 自身锁机制，并结合数据库 Job 状态修复。

租约到期而任务未完成，视为 Worker 失联，允许 Reconciliation 重新调度该任务。所有重试都依赖：

- 稳定的幂等 Job ID（同一版本任务重复发布不产生重复数据）
- `processing_version` 校验（防止旧任务在删除/重处理后回写脏数据）

## 相关决策

- [ADR-004 BullMQ 异步处理](../adr/ADR-004-bullmq-async.md)
- [ADR-005 Transactional Outbox](../adr/ADR-005-transactional-outbox.md)
- [ADR-010 软删除加异步物理清理](../adr/ADR-010-soft-delete-async-purge.md)
