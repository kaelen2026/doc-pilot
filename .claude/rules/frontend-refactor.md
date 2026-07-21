# 前端重构规则:胖组件拆「控制器 Hooks + 展示组件」

一个 React 组件长到把多条互不相干的逻辑连同大段 JSX 都塞在一起时,按此法拆分。
目标不是「让文件变短」,而是**让每条逻辑各有独立落点**,后续加功能不再互相挤压。

## 何时拆

出现下列任一信号,就该拆(而非继续往里堆):

- 单个组件 **> ~300 行**,且还在长;
- 组件里并存 **≥3 簇** 互不相干的 `state + effect + 回调`(如「加载数据」「视图缩放」「导航」「选区」各成一簇);
- 明知**接下来要加的功能**(批注、搜索、缩略图……)每个都会再挂一组 state/effect/回调——现在不拆,加完必破 700 行且看不动。

> 反例:组件虽长但只有一条主线逻辑 + 顺序 JSX,拆了反而增加跳转成本——**不拆**。

## 怎么找接缝

拆分不是凭感觉切段,而是沿**已经存在的自然接缝**下刀:

1. **控制器 Hook = 一簇「独立的 state + effect + 回调」。**
   把「同进同退」的状态与其读写逻辑抽成 `use-<关注点>.ts`,对外只暴露该关注点的
   状态值 + 操作方法(动词化,如 `zoomIn`/`jumpTo`/`addHighlight`),
   **不泄漏内部常量/setter**。纯计算继续留在已解耦的纯函数模块里(便于单测)。
2. **展示组件 = 纯 UI chrome。** 大段「只读 props、只发回调」的 JSX(工具条、菜单、
   侧栏)抽成 `<XxxBar>` / `<XxxMenu>`,自身不持有业务状态。
3. **原组件收敛为编排壳。** 只剩:调用各 Hook、把状态/回调接到展示组件、摆布局。
   跨 Hook 的组合(如「滚动时既更新导航、又收起选区菜单」)在壳里用一个 `useCallback`
   组合两个稳定回调,而不是把耦合塞回某个 Hook。

## 多状态渲染:用早返回,别用嵌套三元

组件要在「加载中 / 未登录 / 出错 / 有数据」这类**互斥、平级**的状态间选一个渲染时,
不要用嵌套三元 `a ? … : b ? … : c ? … : null`——它把平级分支压成纵向嵌套,读的人
得维护一个层层缩进的条件栈,正常分支还藏在最里层。

改用**守卫式早返回**:把渲染体收敛成组件内的一个闭包 `renderBody()`,每种状态一条
`if (…) return <…>`,自上而下平铺;`return (…)` 里只留布局骨架 + `{renderBody()}`。
判据与顺序**原样保留**(早返回的先后 = 原三元的先后),纯搬迁。

**不为此抽独立组件。** 这只是「同一视图的状态路由」这一条逻辑,够不着上面「≥3 簇
互不相干 state/effect」的拆分门槛;真抽成子组件反而要把 `session`/`fileQuery` 之类
当 props 传进去,平添跳转成本。闭包足矣,等状态/头部真长起来再谈拆组件。

> 活参照:`apps/web/app/documents/[id]/view/pdf-view.tsx` 的 `renderBody()`。

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

`use-pdf-highlights.ts` 早先已是这个范式,等于给后抽的 Hook 立了样板——**优先跟随
仓库里已有的接缝写法**,而不是另起一套。
