# 前端组件规则

`apps/web` 组件从**写对**到**拆胖**的完整规约。两部分互补:第一部分是让组件一开始就
不容易长胖的写法,第二部分是它还是长胖了之后怎么拆。git/PR 流程见 [`workflow.md`](workflow.md)。

所有条目都能在仓库里找到活样板;**优先跟随已有接缝写法,不另起一套。**

---

# 一、组件怎么写对

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

- **多状态渲染用早返回,别用嵌套三元。** 组件在「加载中 / 未登录 / 出错 / 有数据」这类
   **互斥、平级**的状态间选一个渲染时,不要用 `a ? … : b ? … : c ? … : null`——它把平级
   分支压成纵向嵌套,正常分支还藏在最里层。改用**守卫式早返回**:把渲染体收敛成组件内的
   一个闭包 `renderBody()`,每种状态一条 `if (…) return <…>`,自上而下平铺;`return (…)`
   里只留布局骨架 + `{renderBody()}`。判据与顺序原样保留。
   **不为此抽独立子组件**——它只是「同一视图的状态路由」一条逻辑,够不着第二部分的拆分门槛,
   真抽出去反而要把 `session`/`fileQuery` 之类当 props 传,平添跳转成本。
   活参照:`answer.tsx`、`chat-view.tsx#renderBody`、`pdf-view.tsx#renderBody`。
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

---

# 二、组件长胖了怎么拆

一个组件长到把多条互不相干的逻辑连同大段 JSX 都塞在一起时,按此法拆分。
目标不是「让文件变短」,而是**让每条逻辑各有独立落点**,后续加功能不再互相挤压。

## 何时拆

出现下列任一信号,就该拆(而非继续往里堆):

- 单个组件 **> ~300 行**,且还在长;
- 组件里并存 **≥3 簇** 互不相干的 `state + effect + 回调`(如「加载数据」「视图缩放」「导航」「选区」各成一簇);
- 明知**接下来要加的功能**(批注、搜索、缩略图……)每个都会再挂一组 state/effect/回调——现在不拆,加完必破 700 行且看不动。

> 反例:组件虽长但只有一条主线逻辑 + 顺序 JSX,拆了反而增加跳转成本——**不拆**。
> 多状态渲染用早返回收敛在闭包里(见第一部分「状态与渲染」),也不算一簇独立逻辑,
> 够不着这里的门槛。

## 怎么找接缝

拆分不是凭感觉切段,而是沿**已经存在的自然接缝**下刀,落回第一部分的三层:

1. **控制器 Hook = 一簇「独立的 state + effect + 回调」。**
   把「同进同退」的状态与其读写逻辑抽成 `use-<关注点>.ts`,对外只暴露该关注点的
   状态值 + 操作方法(动词化,如 `zoomIn`/`jumpTo`/`addHighlight`),
   **不泄漏内部常量/setter**。纯计算继续留在已解耦的纯函数模块里(便于单测)。
2. **展示组件 = 纯 UI chrome。** 大段「只读 props、只发回调」的 JSX(工具条、菜单、
   侧栏)抽成 `<XxxBar>` / `<XxxMenu>`,自身不持有业务状态。
3. **原组件收敛为编排壳。** 只剩:调用各 Hook、把状态/回调接到展示组件、摆布局。
   跨 Hook 的组合(如「滚动时既更新导航、又收起选区菜单」)在壳里用一个 `useCallback`
   组合两个稳定回调,而不是把耦合塞回某个 Hook。

## 铁律

- **行为等价搬迁。** 重构 = 只挪不改。逻辑原样搬到新位置,不顺手改行为、不夹带
   功能。任何行为差异都要在 PR 描述里显式点出。
- **三绿才提交。** `pnpm --filter <pkg> typecheck` + `biome check <改动目录>`(exit 0)
   + `pnpm --filter <pkg> test` 全过,才算完成。
- **流程照 [`workflow.md`](workflow.md)。** worktree 起分支 → PR → CI 门禁 → 合并后清理
   分支(含 `git ls-remote` 验证远端已删)。

## 样板:`apps/web/features/pdf/`(PR #59)

`pdf-reader.tsx` 由 **429 → 127 行**,退成编排壳。可作为本规则的活参照:

| 产物 | 类型 | 关注点 |
|---|---|---|
| `use-pdf-document.ts` | 控制器 Hook | 加载 doc/worker、numPages、outline、error |
| `use-pdf-viewport.ts` | 控制器 Hook | box 尺寸、fullscreen、scale/缩放/整页 |
| `use-pdf-navigation.ts` | 控制器 Hook | current/pageInput、jumpTo/gotoDest、initialPage |
| `use-pdf-selection.ts` | 控制器 Hook | 选区锚点/copied、复制、按页归一化落库高亮 |
| `pdf-toolbar.tsx` | 展示组件 | 工具条纯 UI |
| `pdf-selection-menu.tsx` | 展示组件 | 浮动复制/高亮菜单 |
| `geometry.ts` | 纯函数 | 命中/归一化/缩放/页码(已有单测) |
| `pdf-reader.tsx` | 编排壳 | 调 4 Hook + 摆 3 组件 + 布局 |

`use-pdf-highlights.ts` 早先已是这个范式,等于给后抽的 Hook 立了样板。
`chat-view.tsx` 的 `use-earlier-messages`(PR #63)是同法的又一次应用。
