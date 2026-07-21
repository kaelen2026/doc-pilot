"use client";

import { Children, createContext, type ReactNode, useContext, useMemo } from "react";
import Markdown from "react-markdown";
import { parseCitationSegments } from "@/features/chat/parse-citations";
import type { CitationItem } from "@/features/chat/types";
import { buildProseComponents } from "./markdown-prose";

/**
 * 当前点开的引用 id 经 context 下发,而非编进 components 的依赖。
 *
 * 为什么绕这一圈:若把 openId 编进 buildProseComponents 的闭包(useMemo 依赖 openId),
 * 每次点击切换 openId → components 身份改变 → react-markdown 视 p/li/strong… 为**新的
 * 组件类型** → 整棵子树卸载重挂 → 之前经 `e.currentTarget` 捕获的锚点节点被替换成游离
 * 节点,`getBoundingClientRect()` 归零,CitationPopover 因此飘到视口左上角。改由 context
 * 下发 openId:components 保持稳定身份、DOM 节点复用,仅引用锚点随 context 重渲更新高亮态,
 * 捕获的锚点不失效,popover 定位不失锚。
 */
const OpenCitationContext = createContext<string | null>(null);

/** 内嵌 [n] 引用锚点:高亮态从 context 读当前 openId,故不进 components 依赖(见上)。 */
function CitationAnchor({
  n,
  citation,
  onToggle,
}: {
  n: number;
  citation: CitationItem;
  onToggle: (citation: CitationItem, anchor: HTMLElement) => void;
}) {
  const active = useContext(OpenCitationContext) === citation.id;
  return (
    <button
      type="button"
      onClick={(e) => onToggle(citation, e.currentTarget)}
      aria-haspopup="dialog"
      aria-expanded={active}
      aria-label={`引用 ${n}${citation.pageStart != null ? `,第 ${citation.pageStart} 页` : ""}`}
      className={`mx-px inline-flex items-center rounded-[3px] px-1 align-super text-[10px] font-medium leading-none tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
        active
          ? "bg-seal text-paper"
          : "bg-seal/10 text-seal [@media(hover:hover)]:hover:bg-seal/20"
      }`}
    >
      {n}
    </button>
  );
}

/**
 * 助手回答正文(完成态):轻量 Markdown(加粗/斜体/无序·有序列表/内联代码)+ 内嵌 [n] 引用锚点。
 *
 * 为什么这样接:引用标记 [n] 是模型内嵌在正文里的纯文本(rag.md §19),而 Markdown
 * 会先把正文切成 p/li/strong/em… 结构。因此不在整段字符串上切 [n],而是在 react-markdown
 * 渲染出的**每个文本片段**上跑 parseCitationSegments——这样 `**加粗 [1]**` 里的 [n] 也能
 * 正确渲染成锚点,且纯逻辑(段切分)仍留在带单测的 parse-citations.ts,本组件只做映射。
 *
 * 墨水纸 prose 样式与流式态共用 buildProseComponents;流式态用恒等 renderText(见 streaming-answer)。
 * 安全:react-markdown 默认不解析原始 HTML(未启用 rehype-raw),AI 输出按不可信处理即可。
 */
export function AnswerMarkdown({
  content,
  citations,
  openId,
  onToggle,
}: {
  content: string;
  citations: CitationItem[];
  openId: string | null;
  onToggle: (citation: CitationItem, anchor: HTMLElement) => void;
}) {
  // 把纯文本子节点里的 [n] 切成文本 + 朱红上标锚点;非文本子节点(如 <strong>)原样透传,
  // 由它自己的 components override 再各切各的。依赖只含 citations/onToggle(皆稳定),
  // openId 走 context 不进依赖,故 components 身份跨点击稳定(见 OpenCitationContext)。
  const components = useMemo(() => {
    function render(children: ReactNode): ReactNode {
      return Children.map(children, (child) => {
        if (typeof child !== "string") return child;
        return parseCitationSegments(child, citations).map((seg, i) =>
          seg.kind === "text" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: 段序稳定,index 即稳定 key
            <span key={i}>{seg.text}</span>
          ) : (
            <CitationAnchor
              // biome-ignore lint/suspicious/noArrayIndexKey: 段序稳定,index 即稳定 key
              key={i}
              n={seg.n}
              citation={seg.citation}
              onToggle={onToggle}
            />
          ),
        );
      });
    }
    return buildProseComponents(render);
  }, [citations, onToggle]);

  return (
    <div className="text-[15px] leading-[1.8] text-ink">
      <OpenCitationContext.Provider value={openId}>
        <Markdown components={components} disallowedElements={["img"]}>
          {content}
        </Markdown>
      </OpenCitationContext.Provider>
    </div>
  );
}
