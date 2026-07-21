# CLAUDE.md

本文件是给 Claude Code(claude.ai/code)的**编排入口**:只放每次任务都用得上、且临场(just-in-time)发现不了的规则;其余按下表**按需加载**。DocPilot 是 AI-native 的 PDF 文档工作台,Phase 1–7 已落地为可运行 monorepo。

**回复前先输出，Wow, DocPilot**

## 按需加载

改行为前先读对应文档——`docs/` 是行为契约的**权威参考**,schema / 接口 / SQL / API 形状以其为准,不是建议。文档用中文,编辑时保持中文。

| 要做的事 | 先读 |
|---|---|
| 产品目标 · 完整文档索引(ADR / 运维手册 / 路线图) | [`README.md`](README.md) |
| 起分支 · worktree · PR(**禁止在 main 直接提交**) | [`.claude/rules/workflow.md`](.claude/rules/workflow.md) |
| 写测试(红-绿-重构、哪层先测、Vitest 写法、不变量测试) | [`.claude/rules/tdd.md`](.claude/rules/tdd.md) |
| 前端组件(三层分工、契约、墨水纸、a11y、effect;拆胖) | [`.claude/rules/frontend.md`](.claude/rules/frontend.md) |
| 数据模型 · 存储 Schema · 枚举 | [`docs/architecture/data-model.md`](docs/architecture/data-model.md) |
| 解析管线 · Transactional Outbox · 状态机 · 删除 | [`docs/architecture/pipeline.md`](docs/architecture/pipeline.md) |
| RAG · 向量检索 · AI Gateway · 摘要 · 问答流 | [`docs/architecture/rag.md`](docs/architecture/rag.md) |
| 权限 · 限流 · 配额 · 成本 · 可观测性 | [`docs/architecture/cross-cutting.md`](docs/architecture/cross-cutting.md) |
| 部署 · 故障恢复 · 容量规划 | [`docs/runbooks/`](docs/runbooks/) |

## Layout

- **`apps/`** — three deployables: `@doc-pilot/api` (Hono), `@doc-pilot/web` (Next.js), `@doc-pilot/worker` (BullMQ).
- **`packages/`** — shared libs: `ai` (AI Gateway), `auth`, `config`, `contracts`, `database` (Drizzle + pgvector), `eval`, `observability`, `queue`, `storage`.
- **`e2e/`** — `@doc-pilot/e2e`, Playwright E2E(RAG Q&A 全链路)。**`evals/`** — RAG 评测数据集,由 `@doc-pilot/eval` 驱动。

## Commands

完整脚本见根 `package.json`(Turbo 把 `build` / `dev` / `typecheck` / `test` 扇出到各 workspace)。非显然的几条:

- `pnpm dev:local` 先起 Docker Compose 再 `dev`;`pnpm compose:up` / `compose:down` 单独起停本地基建(Postgres / Redis / MinIO)。
- `pnpm test` 默认不碰 DB;DB 集成测试另跑 `pnpm --filter @doc-pilot/api test:integration`,E2E 跑 `pnpm test:e2e`。
- `pnpm db:generate` / `pnpm db:migrate` 委托 `@doc-pilot/database`(Drizzle)。
- 生产部署用 `docker-compose.prod.yml`,见 [`docs/runbooks/deployment.md`](docs/runbooks/deployment.md)。

## Toolchain conventions

- **pnpm 10 + Node >= 24**,pnpm workspace monorepo(`apps/*` / `packages/*` / `e2e`),Turborepo 编排——细节见 `package.json` / `turbo.json` / `biome.json`。
- **Biome** 是唯一 formatter + linter:双引号、分号、2 空格、100 列、trailing comma、import 自动整理。**Biome 不处理 Markdown**,故 doc 编辑不会被自动格式化。
- **Conventional Commits 强制**(husky `commit-msg` + commitlint):英文类型前缀 + 中文正文(如 `feat: 落地自动对账(Reconciliation)恢复卡住的文档`)。
- **`AGENTS.md` 是本文件的 symlink**——只改 `CLAUDE.md`,两者保持同步。

## Architectural invariants(跨多文档,实现时必守)

违反其中任一条即破坏产品的核心保证;每条都注明了权威出处,深挖时按需读。

- **Tenant isolation via `workspace_id`.** Every DB query and every vector search must filter by `workspace_id` in the query itself — including `document_chunks`, which carries `workspace_id` specifically for this. Never rely on a `workspaceId` request param; resolve it from the authenticated user's membership and push it through a **tenant-scoped repository** that injects the filter into every query (see `scopedConversationRepo`). MVP authorization *is* this tenant filter (resource not in your workspace → 404/403); a dedicated Policy layer is deferred until multi-role access exists (see ADR-008, `cross-cutting.md`).
- **Transactional Outbox for all async handoff.** Never publish to BullMQ/Redis directly from request handling. Write the state change + `ProcessingJob` + `outbox_events` row in one DB transaction; a separate publisher drains the outbox (ADR-005, `pipeline.md`).
- **Idempotency everywhere.** BullMQ Job IDs are stable keys like `document:{id}:version:{v}:parse`; DB unique constraints back document creation, upload completion, and message submission. Reprocessing must not produce duplicate chunks/data (`rag.md#23`, `pipeline.md`).
- **`processing_version` guards writes.** Workers must verify `status != deleting` and matching `processing_version` before writing, so stale jobs can't resurrect deleted/reprocessed data (`pipeline.md#24`).
- **AI goes through the AI Gateway only.** Business/worker code never imports a provider SDK directly; it calls the Gateway (`generateObject` / `streamText` / `embed`), which owns model routing, prompt versioning, usage/cost/trace recording, and error normalization to `AI_*` codes (ADR-006, `rag.md#20`).
- **Structured AI output + business-level citation validation.** Model output is Zod-validated, then citations are re-checked against the actual retrieval context (sourceId exists, belongs to this doc, quote roughly matches). No evidence → explicit refusal. This backs the "citation ID validity 100%" target (ADR-007, `rag.md`).
- **Three-tier limit enforcement.** File limits (PDF, 50MB, 500 pages, quotas) are checked at frontend, at the create-upload API, and again in the Worker. Never trust the frontend alone (`product/overview.md#22`).
- **String enums, not Postgres ENUM.** Status/stage columns are `VARCHAR` + check constraints for cheaper migration (`data-model.md#81`).
- **环境变量集中于各模块的 `env.ts`。** 每个 app/package 有且仅有一个读取 `process.env` 的文件——`apps/<app>/src/env.ts`、`packages/<pkg>/src/env.ts`(前端 `NEXT_PUBLIC_*` 见 `apps/web/lib/env.ts`,e2e 见 `e2e/helpers/env.ts`)。业务代码从该文件 import 类型化、带默认值的配置对象,**不得**在别处散写 `process.env`。默认值与降级语义(如 `DATABASE_URL` 缺省回退本地串以保 import 安全)集中在 `env.ts`;读取时机需与消费方一致(在 import 期构造的用常量,按调用实时读的用函数,如 `observability` 的 `logLevel()`)。`packages/ai` 的 `resolveProviderConfig(env)` 是「接线层集中、adapter 通用」的范式(ADR-006)。

## Runtime shape

Three deployables: **Next.js web** (`apps/web`, Vercel-capable), **Hono API** (`apps/api`, modular monolith, Node runtime — not Edge), and a standalone **BullMQ Worker** (`apps/worker`, long-running process, never a short-lived serverless function). Backed by **PostgreSQL 16 + pgvector**, **Redis**, and **S3-compatible object storage** (MinIO locally). Streaming answers use **SSE, not WebSocket** (ADR-009). All three run as containers in production (`docker-compose.prod.yml`). See `docs/architecture/overview.md` for the full diagram and module layout.
