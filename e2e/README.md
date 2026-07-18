# @doc-pilot/e2e

Playwright 端到端测试,覆盖 RAG 问答完整闭环(`docs/architecture/testing-and-eval.md` §30.4):

> 登录 → 上传测试 PDF → 等 ready → 提问 → 验证回答与引用 → 点击引用展开原文

## 零真实模型

未配置 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 时,worker 的向量化/摘要与 API 的问答都回落
mock adapter。mock 问答会**依据检索到的片段产出一条有效引用**(`apps/api/src/ai/mock-answer.ts`),
所以「回答 + 引用」链路无需真实模型、零网络即可跑通,适合 CI。

## 本地运行

E2E 需要 web(3000)、api(3001)、worker 三个进程,外加 postgres / redis / minio / mailpit。
最省事的方式是用仓库根的 `dev:local` 一把拉起(它会 `docker compose up -d` 再起三个应用):

```bash
# 终端 A:起依赖 + 三个应用(保持前台)
pnpm dev:local
# 首次需要迁移数据库(另开终端):
pnpm db:migrate

# 终端 B:装浏览器(仅首次)并跑 E2E
pnpm --filter @doc-pilot/e2e exec playwright install chromium
pnpm test:e2e
```

关键约定:上传走 API 直传(web 暂无上传 UI);登录验证码从 Mailpit(http://localhost:8025)读取。

> 跑 mock 时需 `RAG_MIN_SCORE=-1`:mock 伪向量的余弦相似度无语义且可能为负,默认的 `0`
> 会把唯一的候选片段过滤掉,导致检索为空 → 拒答。真实 embedding 分数为正,不受影响。

## 环境变量(均有本地默认值)

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `E2E_WEB_URL` | `http://localhost:3000` | 被测 web 源站 |
| `E2E_API_URL` | `http://localhost:3001` | 上传直传用的 API 源站 |
| `E2E_MAILPIT_URL` | `http://localhost:8025` | 读取验证码的 Mailpit HTTP API |

## 测试数据

`fixtures/sample.pdf` 是一份最小可解析 PDF(单页、标准字体、有真实文本层)。
重新生成:`node fixtures/make-pdf.mjs`。

## CI

`.github/workflows/e2e.yml`:PR / push main 时触发,起服务容器 → 迁移 → 后台拉起三应用并等就绪 →
跑 Playwright。失败时上传 `playwright-report` 制品并打印各进程日志。
