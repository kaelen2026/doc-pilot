# TDD 规则:红-绿-重构,先钉行为再写实现

新增/改动**可测的核心逻辑**时,先写会失败的测试,再写让它通过的实现,最后在绿灯下重构。
这不是给所有代码加仪式——TDD 的落点是「一个测试能廉价钉住行为」的那几层。
本仓库的既有约定([`frontend.md`](frontend.md)「一个组件的三层」第 2 层:「凡『复发过
视觉/边界问题』的逻辑都抽到纯函数层钉住不变量」)已经蕴含了这条;本篇把它推到
**先写测试**的节奏,并说明哪些层适用、哪些层不适用。

用 **Vitest**(单元/集成)+ **Playwright**(E2E)。测试**贴着源码放**,同名 `*.test.ts`,
不建 `__tests__` 目录。

## 何时先写测试(沿哪条接缝下刀)

TDD 沿**已解耦、无 I/O 或有 DI 接缝**的代码写;越靠近纯计算越该先写测试:

1. **纯函数层——一律先写测试。** 切块、清洗、分词、几何命中/归一化、限流桶、配额规则、
   引用解析这类「入参 → 出参、无副作用」的逻辑,是 TDD 的主战场。样板:
   `apps/worker/src/pipeline/chunk.test.ts`、`apps/api/src/shared/token-bucket.test.ts`、
   `apps/api/src/modules/quota/quota.rules.test.ts`、`apps/web/features/pdf/geometry.test.ts`、
   `apps/web/features/chat/parse-citations.test.ts`。
2. **有 DI 接缝的业务逻辑——先写测试。** AI Gateway 用**注入的 mock adapter + prompt 注册表**
   构造(`packages/ai/src/gateway.test.ts`),Hono 路由用**注入的依赖探针**构造后对 `Response`
   断言(`apps/api/src/modules/health/health.routes.test.ts`)。构造函数/工厂注入依赖,
   **不**用 `vi.mock` 劫持模块——先写测试会倒逼你把接缝留出来。
3. **架构不变量——必须有「一旦破坏即变红」的测试,优先先写。** 这些是产品的硬保证,
   回归的代价最高(定义见 `docs/architecture/`:cross-cutting / pipeline / rag):
   - **租户隔离**:跨 workspace 的可见性断言,走 `.integration.test.ts`
     (`apps/api/src/modules/conversations/conversation.repository.integration.test.ts`
     用两个 workspace + 唯一 `runId` 隔离,验证 scoped repo 注入了 `workspace_id` 过滤)。
   - **引用校验**:`packages/ai/src/citations.test.ts` 以跨文档的 `CitationSource[]` 夹具,
     断言 `UNKNOWN_SOURCE`/无证据→拒答等错误码,支撑「引用 ID 有效性 100%」目标。
   - **幂等 / `processing_version` 守卫**:重放不产生重复数据、陈旧 job 不复活删除数据
     (`apps/worker/src/repository/processing-guard.test.ts`、outbox/reconcile 测试)。
   - **不泄漏内部**:错误响应不带敏感串(health 路由断言 body `not.toContain("secret")`)。

> **反例:React 组件/Hook 不做组件测试。** 仓库里**没有** Testing Library,前端测试
> 一律是纯逻辑(`geometry`/`parse-citations`/`find-question`/`api`)。要测前端行为,
> 先按 [`frontend.md`](frontend.md)「组件长胖了怎么拆」把逻辑抽成纯函数 `*.ts` 再对它 TDD,
> **展示组件与壳保持薄到不值得测**。别为了测而给壳套渲染测试。

## 红-绿-重构的跑法

- **红**:先写 `describe/it/expect`,`it` 描述用中文陈述行为(「按中心点命中页并归一化到
  `[0,1]`」),跑一次确认**因缺实现而失败**(不是因语法/import 失败)。
- **绿**:写**最小**实现让它通过,不夹带未被任何测试要求的功能。
- **重构**:绿灯下重排结构,行为等价搬迁(见 [`frontend.md`](frontend.md)
  「组件长胖了怎么拆 · 铁律」)。

命令(每个包的 `test` 都是 `vitest run` 单发,**无 watch**;写测试期临时 watch 用裸 `vitest`):

- 单包:`pnpm --filter <pkg> test`(如 `@doc-pilot/ai`)。
- 集成(DB 依赖):`pnpm --filter @doc-pilot/api test:integration`——走独立
  `vitest.integration.config.ts`(`include: **/*.integration.test.ts`、`fileParallelism: false`);
  默认 `test` 由 `vitest.config.ts` 的 `exclude` 排除它们,故普通跑不碰数据库。
- 全量:`pnpm test`(`turbo run test`,`dependsOn: ^build`)。
- E2E:`pnpm test:e2e`(`e2e/tests/*.spec.ts`,需 `pnpm dev:local` 先起全套依赖)。

## 怎么写测试(跟随仓库既有写法)

- **命名与位置**:单元 `*.test.ts` 贴源码;DB 依赖用 `.integration.test.ts` 后缀(以便被
  默认跑排除);E2E 用 `e2e/tests/*.spec.ts`。
- **夹具用模块级常量 + 工厂 helper**,可选项用 `Partial<T>` 覆盖
  (`function answer(overrides: Partial<Answer> = {})`),不引全局 setup 文件。
- **依赖用注入,不用模块劫持**:构造函数/工厂传 mock,`vi.fn()` 做探针;避免 `vi.mock`。
- **集成测试自我隔离**:唯一 `runId`(如 `repo-it-${...}`)+ `beforeAll` 播种 / `afterAll`
  清理;跨租户断言要真的用两个 workspace 才站得住。
- **断言结果对象的形状**:对错误场景断言错误**码**(`UNKNOWN_SOURCE`)而非文案;
  用 `toMatchObject`/`expect.objectContaining` 只钉关心的字段。

## 铁律

- **先红后绿。** 没见过测试因缺实现而失败,就不算 TDD——可能测了个恒真。
- **三绿才提交。** `pnpm --filter <pkg> typecheck` + `biome check <改动目录>`(exit 0)
  + `pnpm --filter <pkg> test` 全过(碰 DB 的另跑 `test:integration`),才算完成。与
  [`frontend.md`](frontend.md)「铁律」口径一致。
- **架构不变量退化即视为 bug。** 上面「架构不变量」四项若无对应测试,补测试优先于加功能;
  已有测试变红不得靠改断言迁就实现。
- **流程照 [`workflow.md`](workflow.md)。** worktree 起分支 → PR → CI 门禁 → 合并后清理分支。

## 样板

| 层 | 活参照 | 钉住什么 |
|---|---|---|
| 纯函数(pipeline) | `apps/worker/src/pipeline/chunk.test.ts` | 切块结构、版本元数据 |
| 纯函数(限流/配额) | `apps/api/src/shared/token-bucket.test.ts`、`.../quota/quota.rules.test.ts` | 令牌桶、配额判定 |
| 纯函数(前端) | `apps/web/features/pdf/geometry.test.ts`、`features/chat/parse-citations.test.ts` | 归一化坐标、引用解析 |
| DI 业务逻辑 | `packages/ai/src/gateway.test.ts` | mock adapter 路由、用量记录 |
| HTTP 路由 | `apps/api/src/modules/health/health.routes.test.ts` | 探针状态码 + 不泄漏内部 |
| 引用校验(不变量) | `packages/ai/src/citations.test.ts` | 未知源/无证据拒答的错误码 |
| 租户隔离(集成) | `apps/api/.../conversation.repository.integration.test.ts` | 跨 workspace 不可见 |
| 幂等/守卫 | `apps/worker/src/repository/processing-guard.test.ts` | 陈旧 job 不复活数据 |
| E2E | `e2e/tests/rag-flow.spec.ts` | RAG 问答全链路 |
