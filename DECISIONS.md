# 决策日志

轻量决策留痕（超轻量 ADR）：只记「选了什么、否了什么及原因、何时重审」。
正式的产品架构决策见 [`docs/adr/`](docs/adr/)；这里记的是日常开发/重构中有取舍、有成本、依赖可变前提的判断。只追加，不改写。

---

## 2026-07-20 决策：架构体检的问题分三批（E/F/G）而非一个大 PR

- **选了什么**：一次架构体检（评分卡 7.4/10）产出的问题按性质分三批、做成栈式 PR 依序合入 main：
  - **E 安全红线**（#48）：跨租户幂等串号(CRIT)、markStage/markFailed 缺版本守卫、WRONG_DOCUMENT 跨文档引用校验被架空。
  - **F 结构收敛**（#50）：抽 `scopedDocumentRepo` 消灭手传 workspaceId（E-CRIT 的成因）、web 接入 `@doc-pilot/contracts` 删镜像并修分页封顶。
  - **G 可测接缝**（#51）：PDF 几何/引用解析/SSE 帧解析抽纯函数 + 单测，去重 stripCodeFence/useReducedMotion，web 首次接入 vitest。
- **否掉了什么 / 为什么**：
  - 否掉「一个大 PR 全改」——三批性质不同（修 bug / 改结构 / 补测试），混在一起 review 不清、回滚粒度太粗；安全红线要能独立、优先合入。
  - 否掉「G-4 也把 documents scopedRepo 做成跨聚合根通用工厂」——conversations 与 documents 查不同表、方法集不同，强抽通用工厂是过度抽象；只收敛到「闭包注入」这一**范式**，与 `scopedConversationRepo` 对齐即可。
- **当时的前提**：单人开发、无人 review；E 的 CRIT 是真实跨租户漏洞需尽快合；三批之间有依赖（F 建在 E 改过的文件上，G 改过 F 的文件），故用栈式 PR + rebase 处理 squash 合并的分叉。
- **何时重审**：出现多角色/多 workspace 复杂授权时，重审 F 的「闭包注入 ≠ 强制注入」是否够（届时可能需要查询构建器层强制租户过滤）。
- **相关**：PR #48 / #50 / #51；体检评分卡见对话；租户不变量见 [`docs/adr/ADR-008-workspace-tenant.md`](docs/adr/ADR-008-workspace-tenant.md)。

## 2026-07-20 决策：体检中三项刻意推迟，不在 E/F/G 内做

- **选了什么**：明确标记三项为「已知限制/后续」，本轮不做：
  1. **问答完整历史的游标分页**：F 只把「客户端 limit 无限递增 → 服务端封顶 100 → 死按钮」修成「封顶 + 到顶隐藏按钮」，未实现 before-message-id 游标分页。
  2. **reconcile 未统一到单一写守卫**：E 把 worker 的 `markStage/markFailed/claim/finalize` 收敛到 `passesProcessingGuard` 一处；reconcile 仍用自己的原子 WHERE `guardedDocumentWhere`（同一不变量、两种表达）。
  3. **marketing 文案未收敛常量**：落地页/徽标里的「50MB、500 页」仍是散写字面量（展示文案，非枚举校验常量）；F 只收敛了真正会漂移的**校验常量**。
- **否掉了什么 / 为什么**：
  - 游标分页是新功能（需后端接口 + 前端改造），超出「体检收敛」范围；当前窗口上限 100 是有意设计，先消除「假装能加载更多」的死按钮即可。
  - reconcile 统一守卫收益是「消灭第二种表达」，但 reconcile 已有测试覆盖、改动面不小、风险/收益比低，留待后续。
  - marketing 文案是 prose，插值常量反而降低可读性，且不构成三层校验的漂移风险。
- **当时的前提**：目标是「把体检发现的债收敛掉」，不是加功能；ROI 低或属新功能的推迟。
- **何时重审**：
  - 游标分页 → 有对话历史超过 100 条的真实用户、或用户反馈翻不到更早消息时。
  - reconcile 统一 → 下次要改动 reconcile 写路径、或新增第三个后台写入点时（趁机收敛）。
  - 文案常量 → 若限额（50MB/500 页）真的要调整、且发现文案没跟着改导致不一致时。
- **相关**：PR #50（分页 + 契约收敛）、PR #48（`passesProcessingGuard` 收敛）；pipeline 守卫见 `pipeline.md §24`。

## 2026-07-24 决策：账户删除的异步交接用「flag + 周期轮询」而非 Transactional Outbox 三件套

- **选了什么**：账户删除不走「状态变更 + `ProcessingJob` + `outbox_events` 同事务」的标准异步交接，而是：
  - API 侧 `requestAccountDeletion` 只做一件事——置位 `user.deletion_scheduled_at = now + 冷静期`（`ACCOUNT_DELETION_COOLDOWN_MS`，7 天；幂等，重复请求不重置倒计时；撤销即清空该列）。
  - worker 侧 maintenance 队列上的周期任务 `purge-account`（repeatable job，`ACCOUNT_PURGE.intervalMs` = 60s）每轮扫描 `deletion_scheduled_at <= now` 的到期账户（partial index 支撑），守卫式硬删：单事务内「收集对象 key → 原子 WHERE 删 user 行（仍到期才命中，撤销则 0 行跳过）→ 登记 `pending_object_deletions`」，随后 drain 阶段实际删 S3 对象（失败留死信，下轮重试）。
- **否掉了什么 / 为什么**：否掉「为账删单独走 outbox + processing_jobs」。Outbox 三件套解决的是「DB 状态已变、但发往 BullMQ 的消息可能丢」的窗口；而账删的交接本身就持久在 DB（`deletion_scheduled_at` 一列即全部交接状态），worker 直接轮询 DB，**没有丢失窗口可言**——与 reconcile 是同一类「以 DB 为队列」的周期任务（`purge-account` 的调度、去重、处理器分发都仿 reconcile）。且账删有 7 天冷静期语义，天然不要求秒级触达，轮询的分钟级延迟完全够；期间撤销只需清列，比撤销一条已入队消息简单得多。为账删再造 outbox 事件 + job 状态机，只会多出两张表的生命周期要维护，换不来任何保证。
- **当时的前提**：账删是目前唯一的「宽限期到期后执行」型任务;maintenance 队列已有 reconcile 的 repeatable 基建可复用;CLAUDE.md 的「Transactional Outbox for all async handoff」针对的是请求处理中直接 publish BullMQ 的丢失窗口，本方案不经请求路径发消息，不违反该不变量的本意。
- **何时重审**：若出现更多同类「延迟执行/到期触发」任务（如订阅到期降级、文档保留期清理），值得把「flag + 轮询 + 守卫删除」抽成通用模式或统一调度；若宽限期语义变化（如支持「立即删除」或到期精度要求进入秒级），轮询间隔与该模型需重估。
- **相关**：`apps/api/src/modules/me/me.service.ts`、`apps/worker/src/purge-account/`（purger / repository / object-drain / processor）、`packages/contracts/src/account.ts`（`ACCOUNT_DELETION_COOLDOWN_*` / `ACCOUNT_PURGE` / `OBJECT_PURGE`）；Outbox 不变量见 [`docs/adr/`](docs/adr/) ADR-005 与 `pipeline.md`。
