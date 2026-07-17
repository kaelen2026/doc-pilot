"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CitationItem, MessageItem } from "@/features/chat/types";
import { useConversation, useMessages, useSendMessage } from "@/features/chat/use-chat";
import { authClient } from "@/lib/auth-client";
import { API_URL } from "@/lib/env";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

const ASKABLE = new Set(["ready", "partially_ready"]);

interface DocDetail {
  id: string;
  title: string;
  status: string;
  pageCount: number | null;
}

async function fetchDocument(id: string): Promise<DocDetail> {
  const r = await fetch(`${API_URL}/documents/${id}`, { credentials: "include" });
  if (!r.ok) {
    throw new Error(r.status === 404 ? "文档不存在" : `HTTP ${r.status}`);
  }
  const { document } = (await r.json()) as { document: DocDetail };
  return document;
}

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
  const messagesQuery = useMessages(conversationId);
  const messages = messagesQuery.data ?? [];
  const { send, streaming, sendError } = useSendMessage(conversationId);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // 流式增量与新消息到达时跟到底部;依赖长度与流文本,避免每次渲染都滚。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 滚动锚定依赖的是内容变化信号
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streaming?.text]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || streaming) {
      return;
    }
    setDraft("");
    void send({ content });
  }

  function retry(assistant: MessageItem) {
    // 配对的提问是消息流里它前面最近的一条 user 消息。
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
  }

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
        </div>
      </header>

      <section
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

            {messages.map((m) =>
              m.role === "user" ? (
                <UserNote key={m.id} content={m.content} />
              ) : (
                <AssistantPassage key={m.id} message={m} onRetry={() => retry(m)} />
              ),
            )}

            {streaming ? (
              <>
                <UserNote content={streaming.question} />
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
                        {streaming.text}
                        <span
                          aria-hidden
                          className="ml-0.5 inline-block h-[1em] w-[3px] translate-y-[2px] animate-pulse rounded-full bg-ink-soft"
                        />
                      </p>
                    </>
                  )}
                </div>
              </>
            ) : null}

            {sendError ? <p className="text-sm text-seal">{sendError}</p> : null}
          </>
        )}
        <div ref={bottomRef} />
      </section>

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
    </main>
  );
}

/** 用户提问:右侧纸凹便签。 */
function UserNote({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-md bg-paper-sunken px-3.5 py-2.5 text-sm leading-[1.7] text-ink-soft">
        {content}
      </p>
    </div>
  );
}

/** 助手回答:墨字直接书写在纸面,引用是朱红脚注。 */
function AssistantPassage({ message, onRetry }: { message: MessageItem; onRetry: () => void }) {
  if (message.status === "failed") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-seal">
          回答生成失败{message.errorCode ? `(${message.errorCode})` : ""}。
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      </div>
    );
  }

  // 引用校验通过才落库,因此「已完成且零引用」只会是显式拒答(ADR-007)。
  const refused = message.status === "completed" && message.citations.length === 0;

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-ink">{message.content}</p>
      {refused ? <Badge variant="seal">未在文档中找到依据</Badge> : null}
      {message.citations.length > 0 ? <CitationFootnotes citations={message.citations} /> : null}
    </div>
  );
}

function CitationFootnotes({ citations }: { citations: CitationItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const active = citations.find((c) => c.id === open);

  return (
    <div className="space-y-2 border-t border-hairline pt-2.5">
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setOpen(open === c.id ? null : c.id)}
            aria-expanded={open === c.id}
            className={`rounded-sm px-2 py-1 text-xs tabular-nums transition-[color,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              open === c.id
                ? "bg-seal/10 text-seal-deep"
                : "text-seal [@media(hover:hover)]:hover:bg-seal/10"
            }`}
          >
            引 {i + 1}
            {c.pageStart != null ? ` · 第 ${c.pageStart} 页` : ""}
          </button>
        ))}
      </div>
      {active ? (
        <blockquote className="space-y-1.5 rounded-md border-l-2 border-seal bg-paper-sunken px-3.5 py-2.5">
          <p className="text-sm leading-[1.7] text-ink-soft">“{active.quote}”</p>
          {active.claim ? <p className="text-xs text-ink-faint">支撑:{active.claim}</p> : null}
        </blockquote>
      ) : null}
    </div>
  );
}
