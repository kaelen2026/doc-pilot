"use client";

import { memo, useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CitationItem, MessageItem } from "@/features/chat/types";
import { AnswerMarkdown } from "./answer-markdown";
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
      <AnswerMarkdown
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
