# 分阶段实施计划（Roadmap）

按 Phase 1–7 推进，每个阶段有明确产出与验收标准。整体最终验收见 [产品概述 · 最终验收标准](../../docs/product/overview.md#39-最终验收标准)。

## Phase 1：基础工程

**产出**

- Monorepo
- Docker Compose
- CI
- 数据库迁移
- Hono API
- Next.js Web
- Worker 骨架

**验收**

- test、build、lint 全部通过
- 本地一条命令启动

## Phase 2：认证与 Workspace

**产出**

- Better Auth
- 邮箱验证码
- User
- Workspace
- Membership
- Session Middleware
- Policy

**验收**

- 未登录无法访问文档
- 不同用户数据隔离

## Phase 3：文件上传

**产出**

- Document
- Storage Adapter
- Presigned URL
- Complete Upload
- Outbox
- 文档列表

**验收**

- 文件直传 MinIO
- 重复确认上传不会重复创建任务

## Phase 4：解析流水线

**产出**

- BullMQ
- Worker
- PDF Parse
- Clean
- Chunk
- Processing 状态

**验收**

- 状态可观察
- 失败可重试
- 重复任务不产生重复 Chunk

## Phase 5：摘要与 AI Gateway

**产出**

- Provider Adapter
- Prompt Registry
- Structured Output
- Usage
- Summary

**验收**

- 摘要符合 Schema
- Token 与成本可查询

## Phase 6：RAG 问答

**产出**

- Embedding
- pgvector
- Retrieval
- Context Builder
- SSE
- Citation

**验收**

- 答案引用有效
- 无证据问题拒答
- 跨文档无法引用

## Phase 7：上线能力

**产出**

- Evaluation
- Observability
- Rate Limit
- 配额
- E2E
- Runbook
- 生产部署

**验收**

- 注册到首次问答完整跑通
- 关键故障可观测、可恢复
