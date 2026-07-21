"use client";

import { Children, type ReactNode, useMemo } from "react";
import Markdown from "react-markdown";
import { completeStreamingMarkdown } from "@/features/chat/stream-markdown";
import type { StreamingState } from "@/features/chat/use-chat";
import { useTypewriter } from "@/features/chat/use-typewriter";
import { buildProseComponents } from "./markdown-prose";

// 光标哨兵:私有区字符,拼到补全后正文末尾,渲染时换成墨色光标——落在最后一个块的行尾
// (紧跟最后一字),而非独占一行。正文里不可能出现此字符,故不会误伤。
const CARET = String.fromCharCode(0xe000);

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1em] w-[3px] translate-y-[2px] animate-pulse rounded-full bg-ink-soft"
    />
  );
}

// 流式态无 citation 对象,renderText 只做一件事:把哨兵换成行内光标;[n] 保持字面
//(以落库消息为准)。组件无依赖,建一次即可。
function injectCaret(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== "string" || !child.includes(CARET)) return child;
    const parts = child.split(CARET);
    return parts.flatMap<ReactNode>((part, i) =>
      // biome-ignore lint/suspicious/noArrayIndexKey: 段序稳定,index 即稳定 key
      i < parts.length - 1 ? [<span key={i}>{part}</span>, <Caret key={`c${i}`} />] : [part],
    );
  });
}
const STREAM_COMPONENTS = buildProseComponents(injectCaret);

/** 生成中的回答:检索提示 + 打字机正文(轻量 Markdown)+ 行内墨色光标。 */
export function StreamingAnswer({ streaming }: { streaming: StreamingState }) {
  const typed = useTypewriter(streaming.text);
  // 对打字机前沿补全未闭合标记,让粗体/斜体/内联代码立即以最终样式渲染,不闪一下裸符号;
  // 末尾拼上光标哨兵,让光标落在正文行尾。
  const safe = useMemo(() => completeStreamingMarkdown(typed) + CARET, [typed]);

  return (
    <div className="space-y-2">
      {streaming.phase === "retrieving" ? (
        <p className="text-sm text-ink-faint">检索文档中…</p>
      ) : (
        <>
          {streaming.sourceCount !== null ? (
            <p className="text-xs text-ink-faint tabular-nums">
              命中 {streaming.sourceCount} 处相关内容
            </p>
          ) : null}
          <div className="text-[15px] leading-[1.8] text-ink">
            <Markdown components={STREAM_COMPONENTS} disallowedElements={["img"]}>
              {safe}
            </Markdown>
          </div>
        </>
      )}
    </div>
  );
}
