# 本机隔离准生产验收与容量基准

本手册用于在开发机上以独立 Compose 项目运行接近生产拓扑的 DocPilot，使用真实文本模型与真实 Embedding 完成 10、100、500 页 PDF 的端到端验收。该环境使用独立端口、数据库、对象存储和 Docker Volume，不读写日常开发环境的数据。

## 前置条件

- Docker Desktop 已启动，建议至少分配 12 GiB 内存和 6 个 CPU。
- Node.js 24、pnpm 10 可用。
- 仓库根目录 `.env` 已配置真实文本模型。支持 AI Gateway（`AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`）或 Anthropic。
- 本机能够拉取 `ollama/ollama` 及 `bge-m3`。Embedding 固定走隔离 Compose 中的 Ollama，不复用宿主机服务。
- 单次测试 AI 预算默认上限为 5 美元。达到上限后用例失败并停止继续发起问答。

严禁提交生成的 `.env.production` 和 `.artifacts/`；两者均已加入忽略规则。脚本不会打印密钥。

## 启动与验收

在仓库根目录执行：

```bash
pnpm staging:prepare
pnpm staging:config
pnpm staging:up
pnpm staging:status
pnpm staging:benchmark
```

`staging:prepare` 从当前仓库根目录 `.env` 生成专用 `.env.production`，随机化数据库、会话、Webhook 与对象存储凭据，并强制 Embedding 使用隔离的 Ollama `bge-m3`。如果在 Git worktree 中执行且当前目录没有 `.env`，脚本会寻找主 worktree 根目录的 `.env`。

`staging:up` 构建并启动 Web、API、Worker、PostgreSQL/pgvector、Redis、MinIO、Ollama 和 Mailpit，等待健康检查完成。首次执行需要下载模型，耗时取决于网络。

Staging 将对象存储端点配置为 `host.docker.internal:39000`，使容器内 Worker 与宿主机浏览器使用同一个可签名地址；该端口仍只映射到隔离环境的 MinIO。

本机 CPU 推理的 500 页单批请求会超过生产默认的 30 秒 Embedding 超时，实测也会超过 5 分钟，因此隔离基准显式设置 `AI_EMBEDDING_TIMEOUT_MS=900000`。该参数由 `packages/ai/src/env.ts` 集中解析，只改变等待上限，不隐藏实际耗时；报告仍记录端到端延迟。

`staging:benchmark` 串行执行三档 PDF：

1. 上传、异步解析、切片、真实向量生成与真实摘要；
2. 每档执行三次流式 RAG 问答，验证回答完成、引用存在且非 Mock；
3. 记录处理耗时、首字节、回答总耗时、引用数、AI 成本和容器资源峰值；
4. 重启 API/Worker 并验证数据持续存在；
5. 重跑迁移验证幂等性；
6. 暂停 Redis，验证 readiness 降级为 503，恢复后再次变绿；
7. 检查失败任务和未消费 Outbox。

结果写入 `.artifacts/staging/<run-id>/report.json` 与 `report.md`；失败时同目录保存 Compose 日志。报告是本机容量基线，不应直接外推为生产容量承诺。

## 清理与诊断

保留数据停止服务：

```bash
pnpm staging:down
```

删除本次隔离环境的容器、网络和 Volume：

```bash
pnpm staging:purge
```

查看当前状态：

```bash
pnpm staging:status
```

完整日志可通过 `node scripts/staging/lifecycle.mjs logs` 获取。脚本使用固定项目名 `docpilot-staging-local`，清理范围只限该隔离环境。

## 通过标准

- 三档文档均进入 `ready`，页数、Chunk 与摘要符合预期。
- 九次真实问答均完成并带有效引用，无 Mock/占位输出。
- 总 AI 记录成本不超过 5 美元。
- API/Worker 重启后数据完整，迁移可重复执行。
- Redis 故障期间 readiness 返回 503，恢复后返回 200。
- 没有失败 Processing Job，没有滞留 Outbox。
- 生成机器可复现的 JSON 和供人工签字的 Markdown 报告。
