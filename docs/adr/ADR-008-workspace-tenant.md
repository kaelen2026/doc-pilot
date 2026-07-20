# ADR-008：Workspace 作为租户边界

**状态**：Accepted

## 背景

系统需要清晰的数据隔离单元。即便 MVP 只有个人使用（登录后自动创建个人 Workspace、角色仅 `owner`），也应从一开始就建立租户边界，避免日后改造。

## 决策

以 Workspace 作为租户边界。所有核心表携带 `workspace_id`，包括 `document_chunks`（便于向量检索直接过滤）。所有数据库查询与向量检索必须包含 `workspace_id`。`workspaceId` 从已鉴权用户的 membership 解析，**不信任请求参数**。

MVP 只有 `owner` 一种角色，**授权即租户过滤**：资源是否属于当前 workspace 由租户过滤在查询里判定（查不到 → 404，越权写 → 403），不设独立 Policy 层。多角色 / 跨 workspace 共享 / 细粒度权限出现时，再引入 `DocumentPolicy` 作为有深度的 seam（详见 [cross-cutting §25.2](../architecture/cross-cutting.md#252-授权mvp-即租户过滤)）。

### 实现约定：租户作用域 Repository

租户过滤**通过租户作用域的 Repository 强制注入，而非在每个方法逐一手传 `workspaceId`**。入口拿到已鉴权的 `workspaceId` 后构造一次作用域仓库（如 `scopedConversationRepo(workspaceId)`），之后所有查询自动带上 `workspace_id`：租户边界收在一个 seam 背后，调用方签名里不再散落 `workspaceId`，**新增方法也漏不掉过滤**。

反面教材是「聚合根信任模式」——入口校验一次聚合根、之后按子资源 id（如 `messageId`）信任。这种模式下租户安全依赖调用顺序，任何直接按子资源 id 操作的新入口都可能越权，与本 ADR「每个查询都带租户过滤」冲突。新模块一律采用作用域 Repository。

约定细则：

- **读（SELECT）**：命中 0 行自然返回空/null，查不到即不泄露。
- **写（UPDATE）**：加 `workspace_id` 到 WHERE 后命中 0 行，**抛错（fail-loud）**——正常流程里资源必属本租户，0 行只可能是越权或数据异常。
- **无 `workspace_id` 列的从属表**（如 `citations`）：经 `innerJoin` 其父表继承租户边界，不冗余加列。

## 后果

- 从第一天起保证多租户隔离，为未来团队协作预留空间。
- 每个查询都需带租户过滤，需通过 Repository 约定与集成测试保证。
- 复杂 ABAC 列入"第一版明确不做"，MVP 仅 `owner` 角色。

## 参见

- [权限模型](../architecture/cross-cutting.md#25-权限模型)
- [数据隔离](../architecture/cross-cutting.md#263-数据隔离)
