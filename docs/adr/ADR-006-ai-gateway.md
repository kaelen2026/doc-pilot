# ADR-006：AI Gateway

**状态**：Accepted

## 背景

业务模块若直接调用 OpenAI / Anthropic 等 Provider SDK，会导致 Provider 绑定、Prompt 散落、Usage/成本无法统一记录、错误格式各异、难以做限流与追踪。

## 决策

引入统一 AI Gateway，作为所有 AI 调用的唯一入口，暴露 `generateObject`、`streamText`、`embed` 三类能力。Gateway 处理链：

```
校验 Capability → 解析 Model Route → 检查 Quota → 解析 Prompt Version
→ 调用 Provider Adapter → 记录 Usage → 记录 Trace → 标准化错误 → 返回
```

Provider 错误统一映射为 `AI_RATE_LIMITED`、`AI_TIMEOUT`、`AI_PROVIDER_UNAVAILABLE`、`AI_INVALID_RESPONSE`、`AI_CONTEXT_TOO_LARGE`、`AI_CONTENT_BLOCKED`、`AI_QUOTA_EXCEEDED`。

## 后果

- 业务层不接触 Provider 原始 SDK 与错误。
- Usage、成本、Trace 统一采集，便于计费与可观测。
- 更换或新增 Provider 只需实现 Adapter。
- Gateway 成为关键路径，需保证其自身可靠性与性能。

## 参见

- [RAG · AI Gateway](../architecture/rag.md#20-ai-gateway)
- [成本统计](../architecture/cross-cutting.md#28-成本统计)
