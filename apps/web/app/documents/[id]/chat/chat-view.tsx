"use client";

import { MESSAGE_PAGE } from "@doc-pilot/contracts";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchDocument } from "@/features/chat/api";
import type { CitationItem, MessageItem } from "@/features/chat/types";
import { useConversation, useMessages, useSendMessage } from "@/features/chat/use-chat";
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

  // 只加载最近 limit 条,向上「加载更早」时递增(窗口即完整历史的后缀)。
  // 上限为契约的 MESSAGE_PAGE.max——服务端对超限 limit 会封顶,客户端必须同口径,
  // 否则窗口到顶后仍无限递增、每次都拿回同样的 max 条,「加载更早」变成死按钮(见架构体检 F)。
  const [limit, setLimit] = useState<number>(MESSAGE_PAGE.size);
  const messagesQuery = useMessages(conversationId, limit);
  const messages = messagesQuery.data?.messages ?? [];
  const hasMore = messagesQuery.data?.hasMore ?? false;
  // 窗口已到服务端上限:即便还有更早的消息,当前分页方式也无法再往前拉(游标分页为后续工作)。
  const atWindowCap = limit >= MESSAGE_PAGE.max;
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

  // 「加载更早」:向前扩窗。加载会在顶部插入内容,记录扩窗前的文档高度,
  // 待新窗口渲染后按增量回补 scrollY,保持用户当前阅读位置不跳动。
  const anchorRef = useRef<number | null>(null);
  const loadEarlier = useCallback(() => {
    anchorRef.current = document.documentElement.scrollHeight;
    setLimit((l) => Math.min(l + MESSAGE_PAGE.size, MESSAGE_PAGE.max));
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages 是「新窗口已渲染」的触发信号,非在体内读取
  useLayoutEffect(() => {
    if (anchorRef.current == null) {
      return;
    }
    const delta = document.documentElement.scrollHeight - anchorRef.current;
    if (delta > 0) {
      window.scrollBy(0, delta);
    }
    anchorRef.current = null;
  }, [messages]);

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
      const index = messages.findIndex((m) => m.id === assistant.id);
      const question = messages
        .slice(0, index)
        .reverse()
        .find((m) => m.role === "user");
      if (question) {
        void send({
          content: question.content,
          clientRequestId: question.clientRequestId ?? undefined,
        });
      }
    },
    [messages, send],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
      <header className={`space-y-3 ${rise}`}>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link href="/documents">← 我的文档</Link>
        </Button>
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
        {sessionPending || (session && docQuery.isPending) ? (
          <p className="text-sm text-ink-faint">加载中…</p>
        ) : !session ? (
          <Button asChild className="w-fit">
            <Link href="/login">请先登录</Link>
          </Button>
        ) : docQuery.isError ? (
          <p className="text-sm text-seal">{String(docQuery.error.message)}</p>
        ) : doc && !askable ? (
          <p className="text-sm leading-[1.7] text-ink-soft">
            文档还在处理中,完成后才能问答。当前状态:{doc.status}。
          </p>
        ) : (
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
                  disabled={messagesQuery.isFetching}
                  className="rounded-full border border-hairline bg-paper px-3.5 py-1.5 text-xs text-ink-soft transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 [@media(hover:hover)]:hover:text-ink"
                >
                  {messagesQuery.isFetching ? "加载中…" : "↑ 加载更早的消息"}
                </button>
              </div>
            ) : null}

            {messages.map((m) =>
              m.role === "user" ? (
                <UserNote key={m.id} content={m.content} />
              ) : (
                <AssistantPassage
                  key={m.id}
                  message={m}
                  onRetry={retry}
                  onViewSource={viewSource}
                />
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
        )}
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
