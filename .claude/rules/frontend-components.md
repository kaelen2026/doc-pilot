# 前端组件开发规则

`apps/web` 组件的**第一天怎么写对**。长胖了怎么拆见 [`frontend-refactor.md`](frontend-refactor.md)
——本篇是让它一开始就不容易长胖的写法。所有条目都能在仓库里找到活样板;
**优先跟随已有接缝写法,不另起一套。**

## 目录归位

- `apps/web/features/<域>/` —— 控制器 Hook(`use-*.ts`)、纯函数、`types.ts` 归此域。
- `apps/web/app/.../` —— 路由局部的展示组件(页面壳、该页专属子组件)。
- `apps/web/components/ui/` —— 跨域复用的 UI 原语(Button/Badge/Card…)。
- `apps/web/lib/` —— 无状态工具(`cn`、`env`、`auth-client`)。

新增逻辑先问「属于哪个域」,而不是就近塞进当前组件文件。

## 一个组件的三层

写组件时按这三层分工,别揉成一坨(样板:`features/pdf/`、`features/chat/`):

1. **控制器 Hook(`use-*.ts`)** —— 持有 `state + effect + 回调`,对外暴露状态值 +
   动词化操作(`jumpTo`/`loadEarlier`/`send`),不泄漏内部 setter/常量。
   数据请求统一走 react-query 包一层的 hook(`useMessages`/`useDocuments`)。
2. **纯函数(`*.ts`)** —— 与 DOM/框架解耦的计算(`geometry.ts`、`parse-citations.ts`、
   `find-question.ts`、`failure-reason.ts`),**必须带单测**。凡「复发过视觉/边界问题」
   的逻辑都抽到这层钉住不变量。
3. **展示组件(`*.tsx`)** —— 只读 props、只发回调,自身不持有业务状态。
   仅在需要状态/交互时加 `"use client"`。

## 状态与渲染

- **分支用卫语句,不用嵌套三元。** 多状态正文(加载/未登录/出错/处理中/正常)自上而下
   early-return(见 `answer.tsx`、`chat-view.tsx#renderBody`)。
- **字符串枚举用 `Set` 成员判定**(`ASKABLE`、`READABLE`),与「VARCHAR + check 约束」
   的后端口径一致,不散写 `===` 长链。
- **列表项 `memo` + 稳定回调。** 流式逐帧 delta 会触发父组件重渲;历史项用 `memo`,
   父层回调用 `useCallback` 保持稳定引用,避免无谓重跑(见 `AssistantPassage`)。
- **服务端是唯一事实源。** 流式/乐观更新以「重拉数据」收尾,本地态不充当权威记录。

## 类型与契约

- DTO/事件类型集中在 `types.ts`,**事件名/上限绑定 `@doc-pilot/contracts` 常量**,
   不写字面量:`CHAT_SSE_EVENTS.*`、`MESSAGE_PAGE.size/max`。契约改名/改值即编译报错或
   同步生效,杜绝前后端静默漂移(见架构体检 F)。
- 前端**不重复定义**已在 contracts 里的常量、上限、枚举。

## 样式(墨水纸)

- **只用设计 token,不写裸色值**:`bg-paper`/`paper-raised`/`paper-sunken`、`text-ink`/
   `ink-soft`/`ink-faint`、`text-seal`、`border-hairline`。token 定义在 `globals.css @theme`。
- **hover 一律 `[@media(hover:hover)]:hover:`**,触屏不留粘滞 hover 态。
- **焦点可见**:交互元素带 `focus-visible:outline-2 outline-offset-2 outline-ring`。
- **UI 原语用 `cva` 变体 + `cn` 合并**,`asChild` 经 Slot 转发,`data-slot` 标记
   (见 `button.tsx`)。禁用/hover 态也要落到 token,别用半透明叠加糊过去。
- **入场用 `rise` 动画**;涉及滚动/动效尊重 `useReducedMotion`。

## 可访问性(底线,非可选)

- 非 `<button>` 的交互元素补 `aria-label` / `aria-expanded` / `aria-haspopup`;
   动态更新区域(流式回答)加 `aria-live`。
- 用非交互容器承接事件(右键、选区)时,`biome-ignore lint/a11y/noStaticElementInteractions`
   **必须带一句理由**,说明为何不是交互控件。

## Effect 卫生

- 每个订阅型 effect 都要清理:`ResizeObserver`/`IntersectionObserver` 用完 `disconnect`,
   `addEventListener` 配对 `removeEventListener`,异步流程用 `cancelled` 旗标防竞态。
- 读 ref 前先 `if (!el) return` 卫一下。
- `useExhaustiveDependencies` 的 `biome-ignore` 只在依赖是「触发信号而非体内读取」时用,
   并写明(见 `use-earlier-messages.ts` 的滚动锚点)。

## 注释

解释**为什么**,不复述代码在做什么。非显然的取舍、边界、时序,以及对应的 ADR /
架构体检编号,都写进注释。文档与注释用中文。
