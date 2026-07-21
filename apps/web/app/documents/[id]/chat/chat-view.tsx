"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useCallback, useState } from "react";
import { HeaderActions } from "@/components/header-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchDocument } from "@/features/chat/api";
import { findQuestionFor } from "@/features/chat/find-question";
import type { CitationItem, MessageItem } from "@/features/chat/types";
import { useConversation, useSendMessage } from "@/features/chat/use-chat";
import { useEarlierMessages } from "@/features/chat/use-earlier-messages";
import { useStickToBottom } from "@/features/chat/use-stick-to-bottom";
import { authClient } from "@/lib/auth-client";
import { AssistantPassage } from "./answer";
import { SourceDrawer } from "./source-drawer";
import { StreamingAnswer } from "./streaming-answer";
import { UserNote } from "./user-note";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

const ASKABLE = new Set(["ready", "partially_ready"]);

export function ChatView({ documentId }: { documentId: string }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const docQuery = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => fetchDocument(documentId),
    enabled: !!session,
  });
  const doc = docQuery.data;
  const askable = !!doc && ASKABLE.has(doc.status);

  const conversationQuery = useConversation(documentId, askable);
  const conversationId = conversationQuery.data?.id;

  const { messages, hasMore, atWindowCap, isFetching, loadEarlier } =
    useEarlierMessages(conversationId);
  const { send, streaming, sendError } = useSendMessage(conversationId);

  const [draft, setDraft] = useState("");
  const { sectionRef, atBottom, scrollToBottom } = useStickToBottom();
  const hasThread = messages.length > 0 || !!streaming;

  // 引用「查看原文」:右侧抽屉打开 PDF 并定位到该页。
  const [source, setSource] = useState<{ page: number } | null>(null);
  const viewSource = useCallback((citation: CitationItem) => {
    if (citation.pageStart != null) {
      setSource({ page: citation.pageStart });
    }
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || streaming) {
      return;
    }
    setDraft("");
    void send({ content });
  }

  // 稳定引用:仅依赖 messages / send,流式期间不变,使 memo 化的消息项不因逐帧
  // delta 重渲(重跑正则)。retry 由配对提问(消息流里前面最近的 user)重发。
  const retry = useCallback(
    (assistant: MessageItem) => {
      const question = findQuestionFor(messages, assistant.id);
      if (question) {
        void send({
          content: question.content,
          clientRequestId: question.clientRequestId ?? undefined,
        });
      }
    },
    [messages, send],
  );

  // 会话区正文按状态分支:加载中 → 未登录 → 出错 → 处理中 → 正常问答。
  // 用卫语句自上而下读,取代深层嵌套三元(见架构体检)。
  function renderBody() {
    if (sessionPending || (session && docQuery.isPending)) {
      return <p className="text-sm text-ink-faint">加载中…</p>;
    }
    if (!session) {
      return (
        <Button asChild className="w-fit">
          <Link href="/login">请先登录</Link>
        </Button>
      );
    }
    if (docQuery.isError) {
      return <p className="text-sm text-seal">{String(docQuery.error.message)}</p>;
    }
    if (doc && !askable) {
      return (
        <p className="text-sm leading-[1.7] text-ink-soft">
          文档还在处理中,完成后才能问答。当前状态:{doc.status}。
        </p>
      );
    }
    return (
      <>
        {messages.length === 0 && !streaming ? (
          <p className="text-sm leading-[1.7] text-ink-faint">
            基于这份文档提问。回答只依据文档内容,并附带可核对的原文引用;文档里没有的,它会直说。
          </p>
        ) : null}

        {hasMore && !atWindowCap ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={loadEarlier}
              disabled={isFetching}
              className="rounded-full border border-hairline bg-paper px-3.5 py-1.5 text-xs text-ink-soft transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 [@media(hover:hover)]:hover:text-ink"
            >
              {isFetching ? "加载中…" : "↑ 加载更早的消息"}
            </button>
          </div>
        ) : null}

        {messages.map((m) =>
          m.role === "user" ? (
            <UserNote key={m.id} content={m.content} />
          ) : (
            <AssistantPassage key={m.id} message={m} onRetry={retry} onViewSource={viewSource} />
          ),
        )}

        {streaming ? (
          <>
            <UserNote content={streaming.question} />
            {/* clientRequestId 作 key:每问一轮重挂,打字机进度归零。 */}
            <StreamingAnswer key={streaming.clientRequestId} streaming={streaming} />
          </>
        ) : null}

        {sendError ? <p className="text-sm text-seal">{sendError}</p> : null}
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
      {/* relative z-30:头部含账户下拉,须压过下方带 rise(独立堆叠上下文)的区块。 */}
      <header className={`relative z-30 space-y-3 ${rise}`}>
        <div className="flex items-center justify-between gap-4">
          <Button asChild variant="link" size="sm" className="px-0">
            <Link href="/documents">← 我的文档</Link>
          </Button>
          <HeaderActions />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="min-w-0 break-words font-display text-2xl font-medium tracking-[-0.012em]">
            {doc?.title ?? "文档问答"}
          </h1>
          {doc?.pageCount ? (
            <span className="text-xs text-ink-faint tabular-nums">{doc.pageCount} 页</span>
          ) : null}
          {doc && doc.status === "partially_ready" ? <Badge>部分就绪</Badge> : null}
          {doc ? (
            <Link
              href={`/documents/${documentId}/view`}
              className="text-xs text-seal underline-offset-4 transition-colors duration-150 [@media(hover:hover)]:hover:text-seal-deep [@media(hover:hover)]:hover:underline"
            >
              阅读原文
            </Link>
          ) : null}
        </div>
      </header>

      <section
        ref={sectionRef}
        className={`flex flex-1 flex-col gap-7 py-8 ${rise}`}
        style={{ animationDelay: "80ms" }}
        aria-live="polite"
      >
        {renderBody()}
      </section>

      {hasThread && !atBottom ? (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="回到底部"
          className="fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-hairline bg-paper/95 px-3.5 py-2 text-xs text-ink-soft shadow-[0_4px_20px_-4px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [@media(hover:hover)]:hover:text-ink"
        >
          <svg
            aria-hidden="true"
            role="presentation"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
          回到底部
        </button>
      ) : null}

      {session && askable ? (
        <form
          onSubmit={submit}
          className={`sticky bottom-0 -mx-6 flex gap-2 border-t border-hairline bg-paper px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 ${rise}`}
          style={{ animationDelay: "160ms" }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="向这份文档提问…"
            aria-label="提问"
            disabled={!conversationId || !!streaming}
          />
          <Button type="submit" disabled={!conversationId || !!streaming || !draft.trim()}>
            提问
          </Button>
        </form>
      ) : null}

      {source ? (
        <SourceDrawer documentId={documentId} page={source.page} onClose={() => setSource(null)} />
      ) : null}
    </main>
  );
}
