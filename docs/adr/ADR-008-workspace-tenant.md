# ADR-008：Workspace 作为租户边界

**状态**：Accepted

## 背景

系统需要清晰的数据隔离单元。即便 MVP 只有个人使用（登录后自动创建个人 Workspace、角色仅 `owner`），也应从一开始就建立租户边界，避免日后改造。

## 决策

以 Workspace 作为租户边界。所有核心表携带 `workspace_id`，包括 `document_chunks`（便于向量检索直接过滤）。所有数据库查询与向量检索必须包含 `workspace_id`。授权通过 Policy 在 Controller 层显式检查，不能仅依赖请求参数中的 `workspaceId`。

## 后果

- 从第一天起保证多租户隔离，为未来团队协作预留空间。
- 每个查询都需带租户过滤，需通过 Repository 约定与集成测试保证。
- 复杂 ABAC 列入"第一版明确不做"，MVP 仅 `owner` 角色。

## 参见

- [权限模型](../architecture/cross-cutting.md#25-权限模型)
- [数据隔离](../architecture/cross-cutting.md#263-数据隔离)
