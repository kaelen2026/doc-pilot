# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**回复前先输出，Wow, DocPilot**

## Workflow

read the relevant `.claude/rules/workflow.md`

## Current state: docs-first, no application code yet

This repo currently contains **only the design specification** for DocPilot (an AI-native PDF document workbench) plus the workspace tooling. There is no `apps/` or `packages/` code yet — `pnpm-workspace.yaml` declares `apps/*` and `packages/*`, but those globs match nothing so far. Implementation proceeds by Phase per [`.ai/plans/roadmap.md`](.ai/plans/roadmap.md); Phase 1 (monorepo scaffolding) has not started.

**The design docs are the authoritative spec.** When implementing anything, read the relevant `docs/` file first — the schemas, interfaces, SQL, and API shapes there are the contract, not suggestions. Docs are written in Chinese; keep that language when editing them.

- Start at [`README.md`](README.md) for the doc index.
- [`docs/architecture/`](docs/architecture/) — the system, split by concern (overview, data-model, pipeline, rag, cross-cutting, testing-and-eval).
- [`docs/adr/`](docs/adr/) — 10 accepted architecture decisions with rationale.
- [`.ai/plans/roadmap.md`](.ai/plans/roadmap.md) — Phase 1–7 deliverables and acceptance criteria; build in this order.

## Commands

- `pnpm install` — install; runs `husky` via the `prepare` script to set up git hooks.
- `pnpm lint` — Biome check (lint + format check) across the repo.
- `pnpm lint:fix` — Biome check with `--write` (applies safe fixes).
- `pnpm format` — Biome format `--write` only.
- `pnpm commitlint` — validate a commit message.

No build/test/dev scripts exist yet — they arrive with Phase 1. When adding them, wire per-package scripts through Turborepo (`turbo.json`) as the roadmap intends.

## Toolchain conventions

- **pnpm 10 + Node >= 24** (enforced by `engines`). This is a pnpm workspace monorepo root.
- **Biome** is the single formatter + linter (config `biome.json`, schema pinned to 2.5.x). Style: double quotes, semicolons, 2-space indent, 100 col, trailing commas, import organizing on. Biome does **not** process Markdown, so doc edits are never auto-formatted.
- **Git hooks (husky)**: `pre-commit` runs `lint-staged` (Biome `--write` on staged `*.{js,jsx,ts,tsx,mjs,cjs,json,jsonc}` only); `commit-msg` runs commitlint.
- **Conventional commits are enforced** (`@commitlint/config-conventional`). Use `feat:`, `fix:`, `docs:`, `chore:`, etc. Existing history uses a Chinese body after the conventional-English prefix (e.g. `docs: DocPilot 设计基线`).

## Architectural invariants (span multiple docs — apply when implementing)

These are the cross-cutting rules the design keeps returning to; violating them breaks the product's guarantees:

- **Tenant isolation via `workspace_id`.** Every DB query and every vector search must filter by `workspace_id` in the query itself — including `document_chunks`, which carries `workspace_id` specifically for this. Never rely on a `workspaceId` request param; authorize through a Policy in the controller (see ADR-008, `cross-cutting.md`).
- **Transactional Outbox for all async handoff.** Never publish to BullMQ/Redis directly from request handling. Write the state change + `ProcessingJob` + `outbox_events` row in one DB transaction; a separate publisher drains the outbox (ADR-005, `pipeline.md`).
- **Idempotency everywhere.** BullMQ Job IDs are stable keys like `document:{id}:version:{v}:parse`; DB unique constraints back document creation, upload completion, and message submission. Reprocessing must not produce duplicate chunks/data (`rag.md#23`, `pipeline.md`).
- **`processing_version` guards writes.** Workers must verify `status != deleting` and matching `processing_version` before writing, so stale jobs can't resurrect deleted/reprocessed data (`pipeline.md#24`).
- **AI goes through the AI Gateway only.** Business/worker code never imports a provider SDK directly; it calls the Gateway (`generateObject` / `streamText` / `embed`), which owns model routing, prompt versioning, usage/cost/trace recording, and error normalization to `AI_*` codes (ADR-006, `rag.md#20`).
- **Structured AI output + business-level citation validation.** Model output is Zod-validated, then citations are re-checked against the actual retrieval context (sourceId exists, belongs to this doc, quote roughly matches). No evidence → explicit refusal. This backs the "citation ID validity 100%" target (ADR-007, `rag.md`).
- **Three-tier limit enforcement.** File limits (PDF, 50MB, 500 pages, quotas) are checked at frontend, at the create-upload API, and again in the Worker. Never trust the frontend alone (`product/overview.md#22`).
- **String enums, not Postgres ENUM.** Status/stage columns are `VARCHAR` + check constraints for cheaper migration (`data-model.md#81`).

## Planned runtime shape (once code exists)

Three deployables: **Next.js web** (Vercel-capable), **Hono API** (modular monolith, Node runtime — not Edge), and a standalone **BullMQ Worker** (long-running process, never a short-lived serverless function). Backed by **PostgreSQL 16 + pgvector**, **Redis**, and **S3-compatible object storage** (MinIO locally). Streaming answers use **SSE, not WebSocket** (ADR-009). See `docs/architecture/overview.md` for the full diagram and module layout.
