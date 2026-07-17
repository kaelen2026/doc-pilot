# ADR-001：模块化单体

**状态**：Accepted

## 背景

MVP 需要一个可运行、可测试、可部署、可扩展的系统，同时避免过度设计。微服务会带来分布式复杂度、运维成本与团队负担，而第一版并没有独立扩展或独立部署各业务域的需求。

## 决策

API 内部采用**模块化单体**：单一进程、单一部署单元，但内部按业务域划分模块（users、workspaces、authorization、documents、uploads、processing、conversations、retrieval、generations、usage、admin）。

每个模块保持清晰的分层与调用方向：

```
Route → Controller → Service → Repository / External Port
```

并遵守边界约束：Route 不写业务逻辑，Controller 不直接操作数据库，Repository 不处理授权，Provider SDK 不出现在业务模块，模块之间通过 Service 或接口调用。

## 后果

- 保留了未来拆分为服务的可能（模块边界清晰）。
- 降低了 MVP 阶段的运维与调试成本。
- 需要团队自律维护模块边界，否则会退化为大泥球。

## 参见

- [架构总览 · 模块边界](../architecture/overview.md#6-模块边界)
- [第一版明确不做](../product/overview.md#38-第一版明确不做)
