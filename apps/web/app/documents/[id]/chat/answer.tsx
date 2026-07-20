"use client";

import { memo, useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseCitationSegments } from "@/features/chat/parse-citations";
import type { CitationItem, MessageItem } from "@/features/chat/types";
import { CitationPopover } from "./citation-popover";

/** 点开的引用及其触发元素(popover 锚点)。 */
interface OpenCitation {
  citation: CitationItem;
  anchor: HTMLElement;
}

/**
 * 助手回答:墨字直接书写在纸面,结论处朱红上标锚点,点击弹出引用原文。
 * memo:消息列表变长后,流式逐帧 delta 触发 ChatView 重渲时,props 未变的历史
 * 回答不再重跑正文正则解析(message 引用稳定,onRetry/onViewSource 流式期间稳定)。
 */
export const AssistantPassage = memo(function AssistantPassage({
  message,
  onRetry,
  onViewSource,
}: {
  message: MessageItem;
  onRetry: (message: MessageItem) => void;
  onViewSource: (citation: CitationItem) => void;
}) {
  // 内嵌锚点与底部脚注共享同一「打开项」:点其一即在其锚点处弹出引用 popover。
  const [open, setOpen] = useState<OpenCitation | null>(null);

  const toggle = useCallback((citation: CitationItem, anchor: HTMLElement) => {
    setOpen((cur) => (cur?.citation.id === citation.id ? null : { citation, anchor }));
  }, []);

  if (message.status === "failed") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-seal">
          回答生成失败{message.errorCode ? `(${message.errorCode})` : ""}。
        </p>
        <Button variant="outline" size="sm" onClick={() => onRetry(message)}>
          重试
        </Button>
      </div>
    );
  }

  // 引用校验通过才落库,因此「已完成且零引用」只会是显式拒答(ADR-007)。
  const refused = message.status === "completed" && message.citations.length === 0;

  return (
    <div className="space-y-3">
      <AnswerBody
        content={message.content}
        citations={message.citations}
        openId={open?.citation.id ?? null}
        onToggle={toggle}
      />
      {refused ? <Badge variant="seal">未在文档中找到依据</Badge> : null}
      {open ? (
        <CitationPopover
          citation={open.citation}
          anchor={open.anchor}
          onClose={() => setOpen(null)}
          onViewSource={onViewSource}
        />
      ) : null}
    </div>
  );
});

/**
 * 答案正文:把模型内嵌的 [n] 标记(n 为引用序号,从 1 开始)渲染成朱红上标锚点,
 * 点击即弹出对应引用原文,与脚注编号一一对应(rag.md §19)。
 * 越界或无对应引用的 [n] 原样保留为文本——模型偶发跑偏时正文仍可读,不整条失败。
 */
function AnswerBody({
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
  // 正文按 [n] 切段(纯逻辑见 parseCitationSegments),这里只把段映射成 ReactNode。
  const parts = parseCitationSegments(content, citations).map((seg, i) => {
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

  return <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-ink">{parts}</p>;
}
