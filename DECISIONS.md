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
