# ADR-010：软删除加异步物理清理

**状态**：Accepted

## 背景

删除一个文档涉及多处清理：Chunk、向量、Citation、Conversation、派生文件、原始文件。同步删除会拖慢请求，且部分失败会留下不一致状态。同时删除过程中不应再接受新问答。

## 决策

采用软删除 + 异步物理清理。删除请求立即执行：

```
Document → deleting
deleted_at = now
拒绝新问答
创建 delete job
```

Worker 异步按序清理所有关联数据与文件，最后标记 `deleted`。使用 `processing_version` 防止旧任务回写；Worker 写入前校验 `status != deleting` 且 `processing_version` 匹配。

## 后果

- 删除请求快速返回，清理可重试。
- 短时间内数据仍存在但对用户不可见（`deleting`）。
- 需要 Reconciliation 处理长时间未完成的删除。

## 参见

- [处理管线 · 删除流程](../architecture/pipeline.md#24-删除流程)
- [故障恢复](../runbooks/failure-recovery.md)
