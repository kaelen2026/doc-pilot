"use client";

import type { ReactNode } from "react";
import type { Components } from "react-markdown";

/**
 * 墨水纸 prose 组件映射,完成态(AnswerMarkdown)与流式态(StreamingAnswer)共用一处样式。
 *
 * renderText 注入到承载文本的元素(p/li/strong/em):完成态传「切 [n] 引用锚点」的实现,
 * 流式态传恒等(保持 [n] 字面——流式期没有 citation 对象,以落库消息为准)。
 * code 不过 renderText,内联代码按字面呈现,不切 [n]。
 */
export function buildProseComponents(renderText: (children: ReactNode) => ReactNode): Components {
  return {
    p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{renderText(children)}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
    li: ({ children }) => <li className="pl-0.5">{renderText(children)}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold text-ink">{renderText(children)}</strong>
    ),
    em: ({ children }) => <em className="italic">{renderText(children)}</em>,
    code: ({ children }) => (
      <code className="rounded bg-paper-sunken px-1 py-0.5 font-mono text-[0.85em] text-ink-soft">
        {children}
      </code>
    ),
  };
}
