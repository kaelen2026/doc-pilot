# 运维手册：生产部署

对应设计 [`cross-cutting.md` §34](../architecture/cross-cutting.md)。部署单元:**Web、API、Worker、PostgreSQL(pgvector)、Redis、对象存储**。Web、API、Worker 各自容器化,`docker-compose.prod.yml` 把三镜像 + pg/redis/minio 串起来。平台无关,任意 Docker 主机可跑,后续可平滑迁到 k8s / PaaS。

## 镜像与构建

- 构建上下文是**仓库根**(pnpm workspace)。三个 Dockerfile 在各自 app 目录:
  - `apps/api/Dockerfile`(含 `migrate` target:一次性数据库迁移)
  - `apps/worker/Dockerfile`
  - `apps/web/Dockerfile`(Next standalone;`NEXT_PUBLIC_*` 在 **build 期**内联,用 build args 传入)
- api/worker:tsup 把 `@doc-pilot/*` 源打进 `dist/index.js`,第三方依赖外部化,`pnpm deploy` 产出扁平(hoisted)的 prod `node_modules`;运行时 `node dist/index.js`。基础镜像 `node:24-alpine`。
- web:`node:24-slim`(避开 sharp/musl 边角),运行 `node apps/web/server.js`。
- 自托管基建镜像**pin 到具体版本 tag**,不用 `latest`(可复现、防上游突变):`minio/minio:RELEASE.2025-09-07T16-13-09Z`、`minio/mc:RELEASE.2025-08-13T08-35-41Z`、`ollama/ollama:0.32.3`(与 `pgvector/pgvector:pg16`、`redis:7-alpine` 同一口径)。升级时改 `docker-compose.prod.yml` 里的 tag 并重新 `up -d`。

## 一键起本地/自托管全栈

```bash
cp .env.production.example .env.production   # 按实际填写(带 [secret] 的务必改)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

> 必须用 `--env-file .env.production`:compose 用它做 `${VAR}` 插值(含 web 的 build args)。容器内环境变量由各 service 的 `env_file` 注入。

> **凭据 fail-fast**:`POSTGRES_PASSWORD`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY` 为**必填**,compose 用 `${VAR:?}` 语法插值——缺任一项时 `docker compose config`/`up` 直接报错拒绝启动,不再回退 `docpilot`/`minioadmin` 弱默认凭据。

启动顺序由 `depends_on` 保证:postgres/redis 健康 → `minio-init` 建桶 → `migrate` 迁移成功 → api/worker 启动 → api 通过 `/health` 健康检查(Node `fetch` 探针)→ web 启动。健康核对:

```bash
curl -sf http://localhost:3001/health       # liveness:{"status":"ok",...}
curl -sf http://localhost:3001/health/ready # readiness:检查 PostgreSQL、Redis、对象存储
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

## Embedding 端点(自托管 ollama 默认)

compose 默认带一个 `ollama` service 作 embedding 后端:`ollama-init` 一次性拉取模型(默认 `bge-m3`,1024 维),api/worker 的 `OPENAI_BASE_URL` 默认指向 `http://ollama:11434/v1`(免 key),并 `depends_on` `ollama-init` 完成后才启动。模型持久化在 `ollama-data` volume。

- **首次启动**会拉取模型(约 1GB),`ollama-init` 完成前 api/worker 不启动;后续复用 volume。
- **CPU 偏慢**:文档多时建议给 ollama 开 GPU(compose 里 `ollama` service 有注释好的 `deploy.resources` 片段,需宿主装 NVIDIA Container Toolkit)。
- **改用官方 OpenAI / 带 embedding 的网关**:删掉 `ollama` / `ollama-init` 两个 service 及 api/worker 对 `ollama-init` 的 `depends_on`,在 `.env.production` 设 `OPENAI_API_KEY`(官方)或对应 `OPENAI_BASE_URL` / `AI_GATEWAY_*`。注意所选 embedding 模型维度须与 `document_chunks.embedding` 的 `vector(1024)` 一致(见 `failure-recovery.md §35.3` 回填)。

## 关键环境变量

全量见 `.env.production.example`。要点:

- **密钥**:`BETTER_AUTH_SECRET`、文本 AI 凭据(`ANTHROPIC_API_KEY` 或 `AI_GATEWAY_API_KEY`)、`S3_ACCESS_KEY_ID/SECRET`、`DATABASE_URL`(含密码)、`REDIS_URL`。用部署平台的 secret 管理,别提交进仓库。
- **文本 AI 凭据必配**:不配 `ANTHROPIC_API_KEY` / `AI_GATEWAY_API_KEY`,摘要/问答会回落 mock(占位输出),生产不可用。embedding 走默认自托管 ollama 时**无需** `OPENAI_API_KEY`(仅改用官方 OpenAI 时才需要)。
- **`WEB_ORIGIN` / `NEXT_PUBLIC_*`** 要与真实公网域名一致(CORS + 前端内联)。
- **`ADMIN_EMAILS`**(可选,逗号分隔):平台管理后台 `/admin` 的访问白名单(cross-cutting.md §25.3)。不配则无人可访问 `/admin`。命中者可跨全部工作区只读用量/成本/目录,按需最小授予。
- **SMTP 限制**:当前 `packages/auth/src/mailer.ts` 用无鉴权 SMTP(`secure:false`,无账号密码)。接需要鉴权/TLS 的真实邮件服务前需扩展 mailer,否则登录验证码发不出。

## Worker 并发(§34.2)

`WORKER_CONCURRENCY`(默认 2)。并发要综合内存、AI Provider 限流、Postgres 连接池、Redis 性能来调。Worker 是常驻进程,**不要**部署成短生命周期 Serverless Function(需要队列消费者常驻、PDF 解析耗时、本地临时文件、可控内存并发)。

## 可观测性与恢复

- 结构化日志默认开(`LOG_LEVEL`)。设 `METRICS_PORT` 各进程暴露 Prometheus `/metrics`(api 与 worker 是独立容器,可用同端口)。
- 卡住的文档由 Worker 内置的周期性 **Reconciliation** 自动恢复(见 [`failure-recovery.md`](./failure-recovery.md))。

## 镜像发布(CI)

`.github/workflows/release-images.yml`:打 `v*` tag 或手动触发时,构建 web/api/worker 三镜像并推到 GHCR(`ghcr.io/<owner>/doc-pilot-{web,api,worker}`)。迁移镜像(2GB+,含构建期全量依赖)不推送 —— 部署主机用 compose 的 `migrate` target 现场构建执行。
