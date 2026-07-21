# 架构总览

## 3. 技术栈

### 3.1 Monorepo

- pnpm
- Turborepo
- TypeScript
- Node.js 24+

### 3.2 Web

- Next.js App Router (16+)
- React
- Tailwind CSS
- shadcn/ui
- TanStack Query
- PDF.js

职责：登录、文档列表、上传、处理进度、PDF 阅读器、摘要、流式问答、引用定位。

### 3.3 API

- Hono
- Zod
- Drizzle ORM
- OpenAPI

推荐 Hono 的原因：

- TypeScript 类型友好
- Web 标准 Request/Response
- 中间件简单
- 可部署到 Node、Serverless 或 Edge
- 适合 BFF 和模块化单体

MVP 中运行在 Node.js，不建议先上 Edge Runtime。原因：

- PDF 处理依赖 Node 生态
- 数据库长连接更可控
- SSE 更容易统一
- 与 Worker 共享代码方便

### 3.4 Worker

- Node.js
- BullMQ
- Redis
- PDF Parser
- AI SDK / Provider SDK

Worker 单独进程部署。职责：PDF 解析、文本清洗、Chunk、Embedding、摘要、删除与补偿、重试任务。

### 3.5 数据与存储

- PostgreSQL 16+
- pgvector
- Redis
- S3-compatible Object Storage

本地开发：PostgreSQL、Redis、MinIO。

生产环境：Managed PostgreSQL、Managed Redis、Cloudflare R2 / AWS S3。

### 3.6 AI 层

推荐通过统一抽象调用：

```
Vercel AI SDK
+
Provider Adapter
```

能力分两类：Embedding Model、Generation Model。

业务代码不直接绑定 OpenAI 或 Anthropic SDK。

## 4. 总体架构

```
┌───────────────────────────────────────────┐
│                Next.js Web               │
│ Auth / Upload / Reader / Chat / Dashboard│
└─────────────────────┬─────────────────────┘
                      │ HTTPS / SSE
┌─────────────────────▼─────────────────────┐
│                   API                    │
│ Auth / Documents / Conversations / Usage │
│ Authorization / Rate Limit / Validation  │
└───────┬──────────────┬────────────┬───────┘
        │              │            │
┌───────▼──────┐ ┌─────▼─────┐ ┌────▼──────────┐
│ PostgreSQL   │ │   Redis   │ │ Object Storage│
│ + pgvector   │ │ + BullMQ  │ │ PDF / Derived │
└──────────────┘ └─────┬─────┘ └───────────────┘
                       │
                ┌──────▼─────────┐
                │ Document Worker│
                │ Parse / Chunk  │
                │ Embed / Summary│
                └──────┬─────────┘
                       │
                ┌──────▼─────────┐
                │   AI Gateway   │
                │ Prompt / Model │
                │ Usage / Retry  │
                └──────┬─────────┘
                       │
                ┌──────▼─────────┐
                │ AI Providers   │
                └────────────────┘
```

### 4.1 系统数据流图

上面的组件框图给出静态结构;下图给出**数据流转**——文档处理管线(绿色实线)与 RAG 问答(下方)如何贯穿各层。交互版(明暗主题切换、PNG/SVG 导出)见 [system-dataflow.html](system-dataflow.html)。

![DocPilot 系统数据流图](system-dataflow.svg)

要点:

- **文档处理管线**:客户端凭预签名 URL 把 PDF 直传对象存储,API 只落元数据并计配额;完成上传时文档状态 + `ProcessingJob` + `outbox_events` 在同一事务写入;Publisher 以 `SKIP LOCKED` 外发到 BullMQ;Worker 解析→清洗→分层 Chunk→Embedding→摘要,结果写回 Postgres/pgvector。
- **异步与一致性**:事务性 Outbox 消除「DB 已提交但队列发布失败」;幂等 JobID 使重复发布不重复处理;`processing_version` + `status` 守卫阻止陈旧任务回写。
- **RAG 问答**:检索在 SQL 内按 `workspace_id` + `document_id` 过滤(租户隔离即授权);AI 全部经 AI Gateway;结构化输出经 Zod + 业务级引用校验,无证据则显式拒答;答案以 SSE 流式返回。

## 5. 代码仓库结构

```
doc-pilot/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   └── lib/
│   ├── api/
│   │   └── src/
│   │       ├── app.ts
│   │       ├── env.ts
│   │       ├── ai/
│   │       ├── middleware/
│   │       ├── modules/
│   │       ├── shared/
│   │       └── index.ts
│   └── worker/
│       └── src/
│           ├── env.ts
│           ├── ai/
│           ├── pipeline/
│           ├── processors/
│           ├── outbox/
│           ├── reconcile/
│           ├── repository/
│           └── index.ts
├── packages/
│   ├── database/
│   ├── contracts/
│   ├── auth/
│   ├── ai/
│   ├── queue/
│   ├── storage/
│   ├── observability/
│   ├── eval/
│   └── config/
├── e2e/
├── evals/
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── adr/
│   └── runbooks/
├── .ai/
│   └── plans/
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

## 6. 模块边界

API 内部采用**模块化单体**。

当前已落地的模块：

```
modules/
├── conversations/
├── documents/
├── health/
├── me/
└── quota/
```

> **与早期设计的差异(现状说明)**:早期草案曾规划 users/workspaces/authorization/
> uploads/processing/retrieval/generations/admin 等更细的模块拆分,并给每个模块设
> Controller 与 Policy 两层。实际实现做了收敛:
> - **Controller 合入 routes**——路由层直接编排 service,不再单设 controller 文件。
> - **Policy 层按 [ADR-008](../adr/ADR-008-workspace-tenant.md) 延后**:MVP 的授权
>   *即*租户过滤(资源不在你的 workspace → 404/403),独立 authorization 模块作为
>   死代码已删除(#44);待多角色访问出现再引入 Policy 层。
> - uploads/processing/retrieval/generations 的职责分别并入 documents(上传/处理)、
>   conversations(检索/生成)域,未单列模块。

每个模块采用(以 `documents/` 为活样板):

```
documents/
├── document.routes.ts       # 路由 + 入参校验(合并了 Controller 职责)
├── document.service.ts      # 业务逻辑
├── document.repository.ts   # 数据访问(租户作用域仓库注入 workspace_id 过滤)
├── document.schema.ts       # Zod schema
└── document.errors.ts       # 错误契约
```

调用方向：

```
Route → Service → Repository / External Port
```

限制：

- Route 不写业务逻辑,只做编排与入参校验
- Service 不直接拼 SQL,数据访问一律走 Repository
- 授权在 MVP 即租户过滤,由**租户作用域仓库**注入 `workspace_id`(见 `scopedConversationRepo`)
- Provider SDK 不出现在业务模块(AI 一律经 AI Gateway)
- 模块之间通过 Service 或接口调用

## 7. 核心领域模型

### 7.1 聚合边界

主要聚合：

- Workspace Aggregate
- Document Aggregate
- Conversation Aggregate
- AI Generation Aggregate
- Processing Job Aggregate

### 7.2 Document 聚合

```
Document
├── DocumentFile
├── DocumentVersion
├── DocumentChunk
└── ProcessingJob
```

- Document 是业务对象。
- DocumentFile 是物理文件。

两者必须分离，因为未来一个文档可能拥有：原始 PDF、提取文本、页面缩略图、OCR 结果、新版本文件。
