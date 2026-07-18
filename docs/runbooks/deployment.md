# 运维手册：生产部署

对应设计 [`cross-cutting.md` §34](../architecture/cross-cutting.md)。部署单元:**Web、API、Worker、PostgreSQL(pgvector)、Redis、对象存储**。Web、API、Worker 各自容器化,`docker-compose.prod.yml` 把三镜像 + pg/redis/minio 串起来。平台无关,任意 Docker 主机可跑,后续可平滑迁到 k8s / PaaS。

## 镜像与构建

- 构建上下文是**仓库根**(pnpm workspace)。三个 Dockerfile 在各自 app 目录:
  - `apps/api/Dockerfile`(含 `migrate` target:一次性数据库迁移)
  - `apps/worker/Dockerfile`
  - `apps/web/Dockerfile`(Next standalone;`NEXT_PUBLIC_*` 在 **build 期**内联,用 build args 传入)
- api/worker:tsup 把 `@doc-pilot/*` 源打进 `dist/index.js`,第三方依赖外部化,`pnpm deploy` 产出扁平(hoisted)的 prod `node_modules`;运行时 `node dist/index.js`。基础镜像 `node:24-alpine`。
- web:`node:24-slim`(避开 sharp/musl 边角),运行 `node apps/web/server.js`。

## 一键起本地/自托管全栈

```bash
cp .env.production.example .env.production   # 按实际填写(带 [secret] 的务必改)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

> 必须用 `--env-file .env.production`:compose 用它做 `${VAR}` 插值(含 web 的 build args)。容器内环境变量由各 service 的 `env_file` 注入。

启动顺序由 `depends_on` 保证:postgres/redis 健康 → `minio-init` 建桶 → `migrate` 迁移成功 → api/worker/web 启动。健康核对:

```bash
curl -sf http://localhost:3001/health     # {"status":"ok",...}
curl -sf http://localhost:3000            # web 200
docker compose -f docker-compose.prod.yml logs worker | grep worker.started
```

## 数据库迁移

- 迁移是独立的一次性步骤(`drizzle-kit migrate`),由 `migrate` service(`apps/api/Dockerfile` 的 `migrate` target)执行,api/worker `depends_on` 其 `service_completed_successfully`。
- 单独重跑:`docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate`。
- 迁移文件在 `packages/database/drizzle/*.sql`,`0000` 会启用 pgvector 扩展 —— 数据库必须是 pgvector 版本(compose 用 `pgvector/pgvector:pg16`)。

## 换成托管服务(推荐生产形态)

`overview.md §7` 建议生产用 Managed PostgreSQL、Managed Redis、Cloudflare R2 / S3。做法:删掉 compose 里对应的 `postgres` / `redis` / `minio` service,并在 `.env.production` 把连接串指向托管端点:

- `DATABASE_URL` → 托管 Postgres(需支持 pgvector,如 Neon/Supabase/RDS+pgvector)。
- `REDIS_URL` → 托管 Redis(如 Upstash)。
- `S3_*` → R2/S3(`S3_ENDPOINT` 指向其端点,`S3_FORCE_PATH_STYLE` 多数设 `false`)。
- Web 也可单独上 Vercel(§34.1),此时只容器化 api/worker。

## 关键环境变量

全量见 `.env.production.example`。要点:

- **密钥**:`BETTER_AUTH_SECRET`、`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`S3_ACCESS_KEY_ID/SECRET`、`DATABASE_URL`(含密码)、`REDIS_URL`。用部署平台的 secret 管理,别提交进仓库。
- **AI Key 必配**:不配 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 会回落 mock(占位输出),生产不可用。
- **`WEB_ORIGIN` / `NEXT_PUBLIC_*`** 要与真实公网域名一致(CORS + 前端内联)。
- **SMTP 限制**:当前 `packages/auth/src/mailer.ts` 用无鉴权 SMTP(`secure:false`,无账号密码)。接需要鉴权/TLS 的真实邮件服务前需扩展 mailer,否则登录验证码发不出。

## Worker 并发(§34.2)

`WORKER_CONCURRENCY`(默认 2)。并发要综合内存、AI Provider 限流、Postgres 连接池、Redis 性能来调。Worker 是常驻进程,**不要**部署成短生命周期 Serverless Function(需要队列消费者常驻、PDF 解析耗时、本地临时文件、可控内存并发)。

## 可观测性与恢复

- 结构化日志默认开(`LOG_LEVEL`)。设 `METRICS_PORT` 各进程暴露 Prometheus `/metrics`(api 与 worker 是独立容器,可用同端口)。
- 卡住的文档由 Worker 内置的周期性 **Reconciliation** 自动恢复(见 [`failure-recovery.md`](./failure-recovery.md))。

## 镜像发布(CI)

`.github/workflows/release-images.yml`:打 `v*` tag 或手动触发时,构建 web/api/worker 三镜像并推到 GHCR(`ghcr.io/<owner>/doc-pilot-{web,api,worker}`)。迁移镜像(2GB+,含构建期全量依赖)不推送 —— 部署主机用 compose 的 `migrate` target 现场构建执行。
