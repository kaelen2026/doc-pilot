# 后端模块规则

`apps/api` 是 Hono **模块化单体**:一个业务域 = 一个 `src/modules/<域>/` 目录,链路
**`Route(handler) → Service → 租户作用域 Repository → Drizzle`**——**没有独立的 Controller
层**,handler 就兼了 controller 的活。

- 横切不变量(租户隔离、Outbox、幂等、AI Gateway、env.ts、字符串枚举……)见
   [`CLAUDE.md`](../../CLAUDE.md) 的「Architectural invariants」——本篇讲**结构与落点**,不复述。
- 行为契约以 `docs/architecture/` 为权威(`data-model` / `pipeline` / `rag` / `cross-cutting`)。
- git/PR 流程见 [`workflow.md`](workflow.md);测试写法见 [`tdd.md`](tdd.md)。

**优先跟随仓库已有模块(`conversations` / `documents`)的写法,不另起一套。**

## 模块解剖

每个域按后缀分文件,职责单一:

| 文件 | 层 | 放什么 |
|---|---|---|
| `<域>.routes.ts` | Route/handler | Hono 处理器:入参解析、解析 `workspaceId`、调 service、序列化响应、SSE 编排 |
| `<域>.service.ts` | Service | 业务编排:状态门禁、幂等、跨模块调用、调 AI Gateway、抛领域错误 |
| `<域>.repository.ts` | Repository | 数据访问,**租户作用域工厂**;异步交接的事务也在这层 |
| `<域>.schema.ts` | 辅助 | 手写 `parseX` 入参校验器 → 类型化输入,非法即抛 `ValidationError` |
| `<域>.errors.ts` | 辅助 | 模块专属领域错误,继承 `shared/errors.ts` 的 `DomainError` |
| 其它域内纯逻辑 | 辅助 | 如 `retrieval.ts`(选源/引用装配),与框架解耦、可单测 |

跨模块共享的东西进 `src/shared/`(错误契约、workspace 解析、rate-limit),中间件进
`src/middleware/`,AI 接线进 `src/ai/`,`process.env` 只在 `src/env.ts` 读。

## 各层怎么写

1. **Route/handler(`*.routes.ts`)** —— 边界层,**不写业务、不碰 DB**。
   - 入参走 `parseX`(见 schema),`workspaceId` 一律从**认证用户的 membership** 解析
     (`activeWorkspaceId(c.get("memberships"))`),**绝不信请求参数里的 workspaceId**。
   - 调 service,拿结果做序列化(`serializeX`)后 `c.json(...)`;SSE 用 `streamSSE`,
     流已开始后的错误转 `message.failed` 事件(改不了状态码了)。
2. **Service(`*.service.ts`)** —— 业务编排,**不碰 Hono/HTTP 类型**。
   - 从 `workspaceId` 构造 `scopedXRepo(workspaceId)` 再调用;跨域调另一模块的 **service**
     (如 `assertAskQuota`),不直接钻进别的 repository。
   - AI 只经 `apiAIGateway`(`src/ai/gateway.ts`),不 import provider SDK。
   - 失败抛 `DomainError` 子类(`NotFoundError` / `ValidationError` / 模块专属错误),
     由 `app.onError` 统一转 HTTP,**不在 service 里拼状态码**。
3. **Repository(`*.repository.ts`)** —— 唯一数据访问层。
   - `scopedXRepo(workspaceId)` 是**工厂**:闭包住 `workspaceId`,把 `workspace_id` 过滤
     **注入每一条查询**(含向量检索、`document_chunks`),业务代码没有「忘加过滤」的机会
     (租户隔离不变量的落点)。
   - 异步交接:状态变更 + `ProcessingJob` + `outbox_events` 写在**同一个 `db.transaction`**
     里(Outbox 不变量的落点,见 `document.repository.ts`),绝不在 handler 里直连 BullMQ。

## 错误与响应

- 通用领域错误在 `shared/errors.ts`:`DomainError(code, message, status)` + 子类
   (`ValidationError` 400 / `NotFoundError` 404 / `ForbiddenError` 403 / `QuotaExceededError` 413)。
- `app.onError` 统一把 `DomainError` 映射成 `{ error: code, message }` + `status`。
- 模块专属错误继承 `DomainError`、留在各自 `*.errors.ts`;错误契约放 `shared` 而非某个业务
   模块,避免其它模块反向依赖它。

## 铁律

- **层不串味。** route 不碰 DB、不写业务;service 不碰 Hono/HTTP、不拼状态码;repository
   不含业务判定。跨域走 service,不钻别人的 repository。
- **三绿才提交。** `pnpm --filter @doc-pilot/api typecheck` + `biome check <改动目录>`(exit 0)
   + `pnpm --filter @doc-pilot/api test`;**动了 DB/repository 再跑** `test:integration`。
- **流程照 [`workflow.md`](workflow.md)。** worktree 起分支 → PR → CI 门禁 → 合并后清理
   分支(含 `git ls-remote` 验证远端已删)。

## 样板:`apps/api/src/modules/conversations/`

| 文件 | 层 | 关注点 |
|---|---|---|
| `conversation.routes.ts` | Route | 4 个 handler + `parseLimit` / `serializeMessage` + SSE 编排 |
| `conversation.service.ts` | Service | 状态门禁、幂等、检索 + AI Gateway、配额校验 |
| `conversation.repository.ts` | Repository | `scopedConversationRepo(workspaceId)` 工厂,事务写消息/引用 |
| `conversation.schema.ts` | 辅助 | `parseCreateConversation` / `parseSubmitMessage` |
| `conversation.errors.ts` | 辅助 | `AnswerRejectedError` / `ConflictError` |
| `retrieval.ts` | 辅助 | `selectSources` / `toCitationSources`(纯逻辑) |

`documents` / `quota` 模块同构;`me` / `health` 轻量、只有 routes。
