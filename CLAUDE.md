# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**回复前先输出，Wow, DocPilot**

## Workflow

read the relevant rule under `.claude/rules/`:

- [`workflow.md`](.claude/rules/workflow.md) — 分支/worktree/PR 流程(禁止直接在 main 提交)。
- [`tdd.md`](.claude/rules/tdd.md) — 红-绿-重构:哪些层先写测试、跑法、Vitest 写法与不变量测试。
- [`frontend.md`](.claude/rules/frontend.md) — 前端组件:怎么写对(三层分工、契约、墨水纸、a11y、effect)+ 长胖了怎么拆。

## Current state: Phase 1–7 implemented

DocPilot (an AI-native PDF document workbench) is now a working monorepo, not just a spec. Phases 1–7 of [`.ai/plans/roadmap.md`](.ai/plans/roadmap.md) have landed: monorepo + Docker Compose + CI, auth/Workspace, file upload, parse pipeline, summary + AI Gateway, RAG Q&A, and go-live capabilities (rate limiting, quotas, observability, E2E, containerization + production compose).

Layout:

- **`apps/`** — three deployables: `@doc-pilot/api` (Hono), `@doc-pilot/web` (Next.js), `@doc-pilot/worker` (BullMQ).
- **`packages/`** — shared libs: `ai` (AI Gateway), `auth`, `config`, `contracts`, `database` (Drizzle + pgvector), `eval`, `observability`, `queue`, `storage`.
- **`e2e/`** — `@doc-pilot/e2e`, Playwright end-to-end tests (RAG Q&A full loop).
- **`evals/`** — RAG evaluation datasets, driven by `@doc-pilot/eval`.

**The design docs remain the authoritative spec.** When implementing or changing behavior, read the relevant `docs/` file first — the schemas, interfaces, SQL, and API shapes there are the contract, not suggestions. Docs are written in Chinese; keep that language when editing them.

- Start at [`README.md`](README.md) for the doc index.
- [`docs/architecture/`](docs/architecture/) — the system, split by concern (overview, data-model, pipeline, rag, cross-cutting, testing-and-eval).
- [`docs/adr/`](docs/adr/) — 10 accepted architecture decisions with rationale.
- [`docs/runbooks/`](docs/runbooks/) — operational guides (`deployment.md`, `failure-recovery.md`).
- [`.ai/plans/roadmap.md`](.ai/plans/roadmap.md) — Phase 1–7 deliverables and acceptance criteria.

## Commands

Root scripts (Turborepo fans these out across the workspace):

- `pnpm install` — install; runs `husky` via the `prepare` script to set up git hooks.
- `pnpm dev` — run all `dev` tasks via Turbo. `pnpm dev:local` brings up Docker Compose first, then `dev`.
- `pnpm build` / `pnpm typecheck` / `pnpm test` — `turbo run build|typecheck|test` across packages.
- `pnpm test:e2e` — Playwright E2E (`@doc-pilot/e2e`).
- `pnpm lint` — Biome check (lint + format check). `pnpm lint:fix` applies safe fixes; `pnpm format` formats only.
- `pnpm compose:up` / `pnpm compose:down` — start/stop local infra (Postgres, Redis, MinIO) via `docker-compose.yml`.
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migration generate/apply (delegates to `@doc-pilot/database`).
- `pnpm commitlint` — validate a commit message.

Production deploy uses `docker-compose.prod.yml` (three containerized services); see `docs/runbooks/deployment.md`.

## Toolchain conventions

- **pnpm 10 + Node >= 24** (pnpm pinned via `packageManager`, node via `engines`). This is a pnpm workspace monorepo root; workspaces are `apps/*`, `packages/*`, and `e2e`.
- **Turborepo** (`turbo.json`) orchestrates `build`, `dev`, `typecheck`, `test`. `build`/`typecheck`/`test` depend on `^build`; `dev` is persistent and uncached.
- **Biome** is the single formatter + linter (config `biome.json`, schema pinned to 2.5.x). Style: double quotes, semicolons, 2-space indent, 100 col, trailing commas, import organizing on. Biome does **not** process Markdown, so doc edits are never auto-formatted.
- **Git hooks (husky)**: `pre-commit` runs `lint-staged` (Biome `--write --no-errors-on-unmatched` on staged `*.{js,jsx,ts,tsx,mjs,cjs,json,jsonc}` only); `commit-msg` runs commitlint.
- **Conventional commits are enforced** (`@commitlint/config-conventional`). Use `feat:`, `fix:`, `docs:`, `chore:`, etc. History uses a Chinese body after the conventional-English prefix (e.g. `feat: 落地自动对账(Reconciliation)恢复卡住的文档`).
- **`AGENTS.md` is a symlink to this file** — edit `CLAUDE.md` only; both stay in sync.

## Architectural invariants (span multiple docs — apply when implementing)

These are the cross-cutting rules the design keeps returning to; violating them breaks the product's guarantees:

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
