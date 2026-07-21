"use client";

import { Children, type ReactNode, useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import { parseCitationSegments } from "@/features/chat/parse-citations";
import type { CitationItem } from "@/features/chat/types";

/**
 * 助手回答正文:轻量 Markdown(加粗/斜体/无序·有序列表/内联代码)+ 内嵌 [n] 引用锚点。
 *
 * 为什么这样接:引用标记 [n] 是模型内嵌在正文里的纯文本(rag.md §19),而 Markdown
 * 会先把正文切成 p/li/strong/em… 结构。因此不在整段字符串上切 [n],而是在 react-markdown
 * 渲染出的**每个文本片段**上跑 parseCitationSegments——这样 `**加粗 [1]**` 里的 [n] 也能
 * 正确渲染成锚点,且纯逻辑(段切分)仍留在带单测的 parse-citations.ts,本组件只做映射。
 *
 * 仅完成态用它;流式期(streaming-answer.tsx)仍是纯文本打字机,避免渲染半截 Markdown。
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
  // 由它自己的 components override 再各切各的。
  const components = useMemo(() => {
    function render(children: ReactNode): ReactNode {
      return Children.map(children, (child) => {
        if (typeof child !== "string") return child;
        return parseCitationSegments(child, citations).map((seg, i) => {
          if (seg.kind === "text") {
            // biome-ignore lint/suspicious/noArrayIndexKey: 段序稳定,index 即稳定 key
            return <span key={i}>{seg.text}</span>;
          }
          const { n, citation } = seg;
          const active = openId === citation.id;
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: 段序稳定,index 即稳定 key
              key={i}
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
        });
      });
    }
    // 只 override 会直接承载文本的元素;代码块/内联代码按字面呈现,不切 [n]。
    const map: Components = {
      p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{render(children)}</p>,
      ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
      li: ({ children }) => <li className="pl-0.5">{render(children)}</li>,
      strong: ({ children }) => (
        <strong className="font-semibold text-ink">{render(children)}</strong>
      ),
      em: ({ children }) => <em className="italic">{render(children)}</em>,
      code: ({ children }) => (
        <code className="rounded bg-paper-sunken px-1 py-0.5 font-mono text-[0.85em] text-ink-soft">
          {children}
        </code>
      ),
    };
    return map;
  }, [citations, openId, onToggle]);

  return (
    <div className="text-[15px] leading-[1.8] text-ink">
      <Markdown components={components} disallowedElements={["img"]}>
        {content}
      </Markdown>
    </div>
  );
}
