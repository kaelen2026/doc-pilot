"use client";

import type { StreamingState } from "@/features/chat/use-chat";
import { useTypewriter } from "@/features/chat/use-typewriter";

/** 生成中的回答:检索提示 + 打字机正文 + 墨色光标。 */
export function StreamingAnswer({ streaming }: { streaming: StreamingState }) {
  const typed = useTypewriter(streaming.text);

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
          <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-ink">
            {typed}
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[1em] w-[3px] translate-y-[2px] animate-pulse rounded-full bg-ink-soft"
            />
          </p>
        </>
      )}
    </div>
  );
}
