# 本机隔离 Staging 验收与容量基准设计

## 1. 目标

建立一套可重复执行的本机准生产验收与容量基准流程。它必须复用生产镜像和生产 Compose
编排，使用真实 `bge-m3` Embedding 与真实文本模型，同时与日常开发环境的数据、端口和
volumes 完全隔离。

本轮要回答三个问题：

1. 生产编排能否从空环境完成迁移、启动和依赖恢复？
2. 登录、上传、解析、Embedding、摘要、RAG 引用链路在真实模型下是否闭环？
3. 10、100、500 页 PDF 的处理时间、资源峰值和 AI 成本分别是多少，主要瓶颈在哪里？

## 2. 范围与约束

- 环境：开发者本机 Docker，固定 Compose project `docpilot-staging-local`。
- AI：Ollama `bge-m3` 真实 Embedding；文本模型读取仓库根目录现有 `.env`。
- 成本：单次完整运行硬上限 5 美元。
- 数据集：合成、带真实文本层的 10、100、500 页 PDF，每档一份。
- 问答：每份文档最多三个问题。
- 结果：生成机器可读 JSON、Markdown 报告和脱敏日志。
- 不覆盖：远程云环境、多主机网络、真实邮件服务、GPU 专项调优和持续高并发压测。

## 3. 方案选择

采用“生产 Compose + Staging overlay + 验收驱动脚本”。

不直接复用生产 Compose 的默认 project、端口和 volumes，避免污染开发数据；不采用
Testcontainers 完全接管容器，因为本轮必须验证生产 Dockerfile、Compose 依赖顺序、迁移容器
和网络接线本身。

```text
docker-compose.prod.yml
        +
docker-compose.staging.yml
        ↓
docpilot-staging-local
```

## 4. 隔离架构

### 4.1 Compose 隔离

- 所有命令显式传入 `--project-name docpilot-staging-local`。
- Staging overlay 为 Web/API 映射独立宿主端口，默认 `3300` 和 `3301`。
- PostgreSQL、Redis、MinIO 和 Ollama 默认只暴露在 Compose 网络内。
- 使用 project-scoped named volumes，不挂载开发环境目录或 volumes。
- Staging bucket、数据库、Better Auth secret 与日常开发配置不同。

### 4.2 配置隔离

`staging-env` 读取仓库根 `.env` 中的真实 AI Provider 配置，生成仅供本轮 Compose 使用的临时
env 文件。生成过程必须：

- 只检查凭据是否存在，不打印值；
- 覆盖 URL、端口、数据库密码、Auth secret、bucket 和运行标识；
- 把临时文件写到已忽略的 `.artifacts/staging/<run-id>/`；
- 在日志与报告中屏蔽 Key、Cookie、OTP、Authorization 和数据库密码。

如果真实文本模型凭据不存在，必须在构建或启动容器之前失败，禁止回落 Mock 后继续验收。

### 4.3 清理安全

清理命令只允许操作完全匹配 `docpilot-staging-local` 的 Compose project。成功运行后可显式执行
cleanup 删除容器、网络和 volumes；失败时默认保留现场，便于查看日志和数据库状态。

## 5. 组件设计

### 5.1 `staging-env`

职责：解析和验证配置、生成临时 env、提供脱敏工具。它不启动任何容器。

### 5.2 `staging-lifecycle`

提供以下动作：

- `up`：构建生产镜像，从空 volumes 启动依赖、迁移、API、Worker 和 Web；
- `status`：输出容器状态、liveness、readiness 和关键依赖状态；
- `verify`：验证服务接线、迁移结果和真实模型配置；
- `down`：经 project name 安全校验后清理隔离环境。

启动必须等待：PostgreSQL、Redis、MinIO、Ollama、migration、API readiness、Web，以及 Worker
的 `worker.started` 日志事件。等待有明确超时，超时后收集 `docker compose ps` 和各服务末尾
日志。

### 5.3 `staging-smoke`

复用现有 Playwright 登录、上传和 RAG helper，验证：

1. OTP 登录并自动创建 Workspace；
2. 真实 PDF 通过预签名 URL 直传；
3. Worker 完成 parse、chunk、Embedding 和真实摘要；
4. 文档最终状态为 `ready`，不得以 `partially_ready` 通过；
5. 三次问题均产生完成的 assistant message 和属于当前文档的有效 citations；
6. 摘要和答案不是 Mock 占位内容；
7. API/Worker 重启后数据仍存在，问答继续可用；
8. migration 容器重复运行成功；
9. 临时停止一个 readiness 依赖时 API 返回 503，恢复后回到 200。

故障注入必须串行执行，并在 `finally` 恢复依赖，避免后续测试建立在损坏环境上。

### 5.4 `capacity-runner`

顺序生成并执行 10、100、500 页三档基准。顺序执行可避免不同文档互相争用 Worker/Ollama，
确保结果主要反映文档规模，而不是并发调度。

每档执行：

```text
生成 PDF
→ 创建上传 + MinIO 直传
→ 等待 ready
→ 执行三个固定问题
→ 查询 DB/metrics/docker stats
→ 写入该档结果
→ 检查累计成本和请求数上限
```

任一档失败后停止更大的档位，保留已经完成的数据和现场。

## 6. 指标口径

### 6.1 文档处理

- PDF 文件大小、声明页数和 Worker 实际页数；
- 文本长度、Chunk 数和向量数；
- 上传耗时、queued 等待时间、processing 时间、端到端 ready 时间；
- 摘要调用次数、耗时、输入/输出 token 和成本；
- processing job 重试数和最终状态；
- Outbox pending/publishing/failed 数量。

### 6.2 问答

- 三次问题各自的检索来源数和最高分；
- 首字延迟、流式完成耗时、总耗时；
- Citation 数量及跨文档/无效引用数量；
- 输入/输出 token 与成本。

### 6.3 资源

- API、Worker、Ollama、PostgreSQL 的 CPU 样本和峰值内存；
- PostgreSQL 数据库尺寸及每档增量；
- MinIO bucket 使用量及每档增量；
- BullMQ 等待、活动、失败和最大队列深度。

资源采样在每档开始前启动、结束后停止，固定间隔写入原始样本，报告只展示峰值和关键分位数。

## 7. 成本控制

- 完整运行最多三份文档、九个问题；
- 每次模型调用后读取 `ai_generations.cost_micros`；
- 达到或预计下一步会突破 5 美元时停止后续调用；
- 同时设置最大 AI generation 数，避免 cost 记录异常导致无限调用；
- 因 Provider 真实账单可能与本地估算存在差异，报告明确标注“Gateway 估算成本”。

预算停止属于受控结果，结论为 `PASS_WITH_WARNINGS` 或 `FAIL`，取决于预算前是否已完成所有硬门禁。

## 8. 成功标准

### 8.1 硬门禁

- 空 volumes 下完整迁移和启动成功；
- liveness/readiness 行为正确；
- 真实 Embedding 和真实文本模型均生效；
- 三档文档均为 `ready`，页数、Chunk、Embedding、摘要数据完整；
- 每档三个问题均完成且引用有效；
- 重启后数据持久且服务恢复；
- migration 重跑幂等；
- 无未解释的 failed job、Outbox failed 或容器崩溃；
- Gateway 估算累计成本不超过 5 美元。

### 8.2 观察阈值

- 问答首字延迟目标 P95 小于 3 秒；
- 单文档处理最长等待 30 分钟；
- Worker 峰值内存超过 2GB 时报告标红，但不中断正在进行的测量；
- 处理时间、Embedding 吞吐和 Ollama 资源占用不预设通过线，用本轮结果建立基线。

## 9. 错误处理

- 配置、构建或迁移失败：立即停止，输出对应服务日志；
- 文档失败或超时：保存 Document、ProcessingJob、Outbox 和 BullMQ 状态；
- Provider 限流：记录重试、等待和最终错误，不隐藏为普通超时；
- 预算触发：停止新 AI 调用，完成报告写入；
- 资源采样失败：验收可继续，但结论至少为 `PASS_WITH_WARNINGS`；
- 清理失败：输出仍存活的资源名，不执行模糊匹配或全局 Docker 清理。

## 10. 报告

每次运行输出：

```text
.artifacts/staging/<run-id>/
├── report.json
├── report.md
├── generated/
│   ├── 10-pages.pdf
│   ├── 100-pages.pdf
│   └── 500-pages.pdf
├── samples/
│   └── container-stats.jsonl
└── logs/
    ├── api.log
    ├── worker.log
    └── compose.log
```

`report.json` 保存原始结果和 schema version；`report.md` 展示结论、分档对比、失败证据、瓶颈
判断和上线建议。最终状态只能是 `PASS`、`PASS_WITH_WARNINGS` 或 `FAIL`。

## 11. 测试策略

- 配置解析、脱敏、预算判断、指标聚合和报告渲染采用单元测试；
- Compose 合并结果使用 `docker compose config` 静态验证；
- lifecycle 使用固定 project 的本机 smoke test；
- capacity runner 用小型 fixture 测试失败停止、预算停止和部分报告；
- 完整 10/100/500 页真实模型基准作为显式手动命令，不放入普通 PR CI，避免高成本与长耗时；
- 普通 CI 只运行零成本单元测试、Compose 配置检查和 Mock 小档 smoke 接缝。

## 12. 交付物

- Staging Compose overlay；
- 配置、生命周期、smoke、基准和报告脚本；
- 合成 PDF 生成器；
- package scripts 与运行文档；
- 单元测试和低成本 CI 检查；
- 一份本机真实模型验收报告，不提交其中的凭据、Cookie、OTP 或原始敏感日志。
