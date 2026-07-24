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

## 视觉回归

`tests/visual.spec.ts` 对墨水纸设计系统做像素级门禁:**登录页 / 文档列表空态 / 账户页 ×
浅色/深色 × 桌面(1280)/移动(390)**,共 12 张基线,存于 `tests/visual.spec.ts-snapshots/`
并提交进仓库。视口矩阵由 `playwright.config.ts` 的 `visual-desktop` / `visual-mobile` 两个
project 提供;PDF 阅读页与聊天页(canvas / SSE 流式,抖动源)刻意不在首批范围内。

**基线只认 Linux(CI 平台)**:Literata 仅拉丁字形,中文走系统衬线兜底,macOS 与 Linux
渲染必然不同——非 Linux 平台上视觉用例自动 skip,本地 `pnpm test:e2e` 不受影响。CI 显式安装
`fonts-noto-cjk` 钉住中文兜底字体。

确定性策略:每次运行注册全新用户(空列表、单会话、零用量,布局恒定);动画由
`toHaveScreenshot` 快进到终态;邮箱、日期、随机用户名等动态文本用 `mask` 盖住;
`maxDiffPixelRatio: 0.01` 只兜亚像素抗锯齿,不掩盖真实回归。

### 基线引导 / 更新(有意改视觉后)

基线的唯一产地是 CI。流程(引导与更新同一条路):

```bash
# 1. 有意改动视觉后,删掉受影响的基线文件(新增截图则跳过此步),推分支。
rm e2e/tests/visual.spec.ts-snapshots/account-*.png

# 2. CI 视觉用例因「基线缺失」失败并重新生成基线,下载制品:
gh run download <run-id> -n visual-snapshots -D e2e/tests/visual.spec.ts-snapshots

# 3. 肉眼检查新基线符合预期后提交,CI 转绿。
```

非预期的视觉 diff(真回归):下载 `playwright-report` 制品,HTML 报告里有
expected / actual / diff 三联图定位。

## CI

`.github/workflows/e2e.yml`:PR / push main 时触发,起服务容器 → 迁移 → 后台拉起三应用并等就绪 →
跑 Playwright。失败时上传 `playwright-report` 制品并打印各进程日志;视觉基线缺失/不匹配时
追加上传 `visual-snapshots` 制品(见上节)。
