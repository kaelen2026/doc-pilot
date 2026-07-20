# 运维手册：万级 DAU 资源规划

面向 **10,000 DAU** 的容量与资源规划。配合 [`deployment.md`](deployment.md) 使用:部署形态见彼,本篇只谈**规模与资源**——每个组件要多大、瓶颈在哪、哪些旋钮要调、上线前要核对什么。

> 本篇的数字建立在下方**行为假设**上,假设变则数字变。所有单量参数均引自代码,便于按你的真实数据重算。

## 1. 假设与负载模型

行为假设(中等活跃画像,配额上限见 [`packages/contracts/src/limits.ts`](../../packages/contracts/src/limits.ts)):

| 行为 | 人均/天 | 日总量 | 备注 |
| --- | --- | --- | --- |
| 提问 | 6 次 | **60,000** | 月配额 `MONTHLY_QUESTIONS_QUOTA=1000`,远高于人均 |
| 上传文档 | 1 篇 | **10,000** | 上传低频;同 workspace 内容级去重(SHA256)会短路重复件 |

峰值折算(日流量集中在 ~8 活跃小时,峰值小时取均值 2×):

- 提问峰值 ≈ **4–5 QPS**(`60000 / 8h × 2`)
- 上传峰值 ≈ **0.7 篇/s**

限流(`limits.ts` `RATE_LIMITS`,令牌桶,Redis Lua 原子、跨实例一致)只挡异常,不影响容量:`ask` 10/min/用户、`uploadCreate` 20/min/用户,均远高于人均行为。

## 2. 单量成本参数(资源估算依据,全部引自代码)

| 参数 | 值 | 出处 |
| --- | --- | --- |
| 应答 / 摘要模型 | `claude-opus-4-8`($5/$25 每百万 token) | `apps/api/src/env.ts`、`apps/worker/src/env.ts` |
| Embedding | `bge-m3` / 1024 维 / 自托管 Ollama / 零调用成本 | `apps/worker/src/env.ts` |
| 切片 | 目标 700 / 上限 1000 / overlap 120 token | `apps/worker/src/pipeline/chunk.ts` |
| Embed 批大小 | 64 | `apps/worker/src/pipeline/embed.ts` |
| 召回 → 注入 | candidateLimit 20 → maxSources 8 | `packages/contracts/src/chat.ts` |
| 上下文预算 | 6000 + 历史 2000 token | `packages/contracts/src/chat.ts` |
| 摘要单遍阈值 | ≤12000 token 单遍,否则按 6000/章节 Map-Reduce | `apps/worker/src/env.ts` |
| 单文档上限 | 50MB / 500 页 / 5000 chunks | `limits.ts` |

## 3. 逐组件资源需求

推荐值以「单量 → 峰值 → 副本/规格」推导。生产建议 Postgres / Redis / 对象存储换托管服务(见 `deployment.md`)。

### 3.1 API(Hono / Node)🟢 舒适

I/O 密集,SSE 长连接。峰值在飞 SSE ≈ **50–70 条**(5 QPS × 每条约 10–15s)。Node 轻松扛。

- **2–3 副本**,每副本约 **1 vCPU / 1GB**,前置负载均衡器。
- ⚠️ api 在 `docker-compose.prod.yml` 绑定固定宿主端口,无法直接 `deploy.replicas`(端口冲突)。多副本需去掉固定 `ports` 映射并加 LB(Nginx/Traefik/云 LB)。
- 每副本连接池 `DATABASE_POOL_MAX=20`(见 §4)。

### 3.2 Worker(BullMQ)🟠 吞吐瓶颈,需调参

需扛上传峰值 0.7 篇/s。单文档端到端约 30–60s(被摘要的多次 opus 调用主导,**以等待 LLM 为主 = I/O bound**)。

- 代码默认 `WORKER_CONCURRENCY=2` 过低;prod 已抽成旋钮,缺省 **8**。单进程吞吐 ≈ `8 / 45s ≈ 0.18 篇/s`。
- 撑峰值需 ≈ 4 个进程:**`WORKER_REPLICAS=2–3` × `WORKER_CONCURRENCY=8`**,每副本约 **2 vCPU / 2GB**。
- ⚠️ PDF 解析(尤其 500 页)是 **CPU/内存密集**,与 LLM 等待型任务抢核;大文档洪峰会堆高 `document-processing` 队列(BullMQ 能扛 backlog,但延迟上升)。密集期监控队列深度,必要时加副本。
- 总吞吐 ≈ `WORKER_REPLICAS × WORKER_CONCURRENCY`,**上限受 §3.6 网关额度与 §3.5 Ollama 吞吐约束**,别只顾调大 worker。

### 3.3 PostgreSQL + pgvector 🟡 需规划磁盘与内存

- **写入/存储增长**:10k 文档/天 × ~30 chunks ≈ **300k 向量/天**。每向量 1024×4B ≈ 4KB,加正文与索引,约 **1.5–2 GB/天 ≈ 50–60 GB/月**。需按保留策略规划磁盘并留余量。
- **HNSW 索引**已在 `packages/database/src/schema/chunk.ts` 与迁移 `0005` **无条件创建**(`hnsw + vector_cosine_ops`)。检索性能要求索引尽量常驻内存——**RAM 应覆盖向量索引工作集**,随 chunk 总量增长扩容内存。
- **检索负载轻**:峰值仅 ~5 QPS,且每次查询已被 `workspace_id + document_id` 预过滤到单篇(≤5000 chunks),搜索空间极小。CPU 不是瓶颈。
- 起步规格:**4 vCPU / 16GB / SSD**,内存随索引增长上调。推荐托管(Neon / Supabase / RDS + pgvector)。
- **连接数是真陷阱**,见 §4。

### 3.4 Redis 🟢 舒适

BullMQ 三队列(`document-processing` / `ai-generation` / `maintenance`)+ 限流令牌桶 + Outbox。作业量温和,令牌桶 key 轻量。

- **1–2 GB 内存**,托管(如 Upstash)即可。
- 配置 BullMQ 完成/失败作业保留上限,避免内存无界增长。

### 3.5 Ollama Embedding(自托管)🟠 隐藏瓶颈,需压测

零 API 成本 ≠ 零算力。峰值 embedding ≈ **入库 21/s(批 64)+ 查询 0.7/s**。

- **单实例 bge-m3 在 CPU 上偏慢**,难扛 21/s 峰值。**强烈建议 GPU**(`docker-compose.prod.yml` 的 `ollama` service 已备注释好的 `deploy.resources` GPU 片段;一块 T4/L4 级即绰绰有余)。
- 该链路当前**无横向扩展设计**(compose 单 `ollama` service)。若不上 GPU,需自行在前面放多副本 + LB,属架构缺口。
- 上线前必须**实测**入库峰值吞吐与查询延迟(查询延迟直接影响问答首字延迟目标 <3s)。

### 3.6 LLM 网关 🔴 头号约束:额度与成本

日 token 量(平均文档 ~15k token 估):

| | 输入/天 | 输出/天 |
| --- | --- | --- |
| 应答 60k ×(6k in + 0.6k out) | 360M | 36M |
| 摘要 10k ×(~18k in + 2k out) | 180M | 20M |
| **合计** | **~540M** | **~56M** |

- **额度(硬约束)**:输入 540M/天集中在 ~8 活跃小时 ≈ **峰值 ~1M+ TPM**;峰值请求 ~5 应答流/s + 摘要调用。**上线前必须确认网关账户 TPM/RPM 配额覆盖峰值**——`ai-generation` 与管线当前无队列级限流,节流只靠 provider 返回 `AI_RATE_LIMITED` + 重试退避(5 次,指数退避基 2s),额度不足则峰值大面积失败/堆积。
- **成本(opus 全量)**:输入 `540M × $5` + 输出 `56M × $25` ≈ **$4,100/天 ≈ $123k/月**。见 §6。

### 3.7 对象存储(S3 / R2)🟢 舒适

- 10k 上传/天 × 均 ~5MB ≈ **50 GB/天入站**,加抽取文本/缩略图。预签名直传已卸载 API 带宽。
- 此规模用 **R2 / S3**,不要用 MinIO 单节点。存储随保留策略增长(内容级去重会显著降低重复上传占用)。

## 4. 连接数预算(务必核对)

连接池已抽成每进程可调的 `DATABASE_POOL_MAX`(缺省 10 = postgres.js 原默认;prod 缺省 20)。**多副本下直连数会超过 Postgres 默认 `max_connections=100`**:

| 来源 | 副本 × 池 | 直连数 |
| --- | --- | --- |
| API | 3 × 20 | 60 |
| Worker | 3 × 20 | 60 |
| **合计** | | **120 > 100** |

**必须二选一**:

1. **前置 PgBouncer**(transaction pooling,推荐):应用池不再 1:1 映射 PG 后端连接,`DATABASE_POOL_MAX` 可放心设 20;或
2. 调高 Postgres `max_connections`(如 200)并相应加内存,同时据实压低 `DATABASE_POOL_MAX`。

上量前按 `副本数 × DATABASE_POOL_MAX ≤ max_connections × 0.8` 反推,给迁移/维护/reconcile 留余量。

## 5. 配置旋钮总表

| 旋钮 | 位置 | 代码默认 | prod 缺省 | 10K DAU 建议 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `WORKER_CONCURRENCY` | worker env | 2 | 8 | 8 | I/O bound,受网关额度约束别过高 |
| `WORKER_REPLICAS` | prod compose | 1 | 1 | 2–3 | worker 无端口绑定,可直接多副本 |
| `DATABASE_POOL_MAX` | database env | 10 | 20 | 20 + PgBouncer | 见 §4 连接预算 |
| 应答 / 摘要模型 | `AI_ANSWER_MODEL` / `AI_SUMMARIZE_MODEL` | opus-4-8 | opus-4-8 | **改 Sonnet/Haiku** | 见 §6,单一最大成本杠杆 |
| 网关 TPM/RPM | 网关账户侧 | — | — | 覆盖峰值 ~1M+ TPM | 见 §3.6,上线前必须确认 |
| Ollama GPU | prod compose `ollama.deploy` | 关 | 关 | **开** | 见 §3.5 |

前三项已在配置中落地为可调旋钮(见 `.env.production.example`);后三项是上线前的成本/依赖决策。

## 6. 成本与模型路由

opus 全量应答+摘要 ≈ **$123k/月**(§3.6),在此规模不可持续。**单一最大杠杆是模型选择**:

- 文档问答/摘要对模型要求通常低于旗舰,换 **Sonnet** 或 **Haiku** 可将 LLM 成本降约一个数量级(具体按当前价目表核算)。
- AI 全部经 Gateway(ADR-006),模型路由是集中的:改 `AI_ANSWER_MODEL` / `AI_SUMMARIZE_MODEL` 即可切换,业务代码无需改动。
- 可分级路由:摘要用更便宜档、应答按需升档;或对长文摘要用小模型 map、大模型 reduce。
- Embedding 走自托管 Ollama,**零 API 成本**,只吃自有算力(§3.5)。
- 配额侧兜底:`MONTHLY_AI_TOKENS_QUOTA=2,000,000` / workspace,按 workspace 拦截,防单租户失控。

## 7. 上线前检查清单

- [ ] **网关额度**:确认 TPM/RPM 覆盖峰值 ~1M+ TPM、~5+ RPS(§3.6)。
- [ ] **模型路由**:确认 `AI_ANSWER_MODEL` / `AI_SUMMARIZE_MODEL` 为成本可接受的选择(§6)。
- [ ] **连接预算**:`副本数 × DATABASE_POOL_MAX ≤ max_connections × 0.8`,或已上 PgBouncer(§4)。
- [ ] **Ollama**:GPU 已开或已实测能扛入库峰值吞吐(§3.5)。
- [ ] **Worker**:`WORKER_REPLICAS × WORKER_CONCURRENCY` 能扛上传峰值,且不超网关/Ollama 上限(§3.2)。
- [ ] **Postgres**:磁盘按 ~60GB/月增长留量;RAM 覆盖 HNSW 索引工作集(§3.3)。
- [ ] **对象存储**:用 R2/S3 而非单节点 MinIO(§3.7)。
- [ ] **API**:多副本前置 LB,已去掉固定端口映射(§3.1)。

## 8. 观测与告警阈值

对应 `cross-cutting.md` 可观测性设计;上量后重点盯以下信号:

| 信号 | 含义 | 告警方向 |
| --- | --- | --- |
| `AI_RATE_LIMITED` 比率 | 网关额度不足 | 持续 >0 即需扩额度/降并发 |
| `document-processing` 队列深度 | Worker 吞吐跟不上上传 | 持续增长 = 加副本 |
| Postgres 活跃连接数 / `max_connections` | 连接池打满风险 | 接近上限 = 上 PgBouncer / 降池 |
| Ollama embedding 延迟 | 影响入库速度与问答首字延迟 | 峰值抬升即需 GPU/扩容 |
| ai_generations 成本(`cost_micros`)/日 | 成本失控 | 超预算即切模型 |
| 问答首字延迟(`time_to_first_token_ms`) | 用户体验(目标 <3s) | P95 越目标即排查检索/网关 |

> 以上单量假设(6 提问 / 1 上传、平均文档 ~15k token)是估算地基,成本与 worker/Ollama 规模对其近似线性敏感。用真实的人均提问数与平均文档页数替换,即可重算全篇。
