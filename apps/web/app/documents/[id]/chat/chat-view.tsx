"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CitationItem, MessageItem } from "@/features/chat/types";
import {
  type StreamingState,
  useConversation,
  useMessages,
  useSendMessage,
} from "@/features/chat/use-chat";
import { authClient } from "@/lib/auth-client";
import { API_URL } from "@/lib/env";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

const ASKABLE = new Set(["ready", "partially_ready"]);

/** 点开的引用及其触发元素(popover 锚点)。内嵌锚点与底部脚注共用。 */
interface OpenCitation {
  citation: CitationItem;
  anchor: HTMLElement;
}

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
  const { sectionRef, atBottom, scrollToBottom } = useStickToBottom();
  const hasThread = messages.length > 0 || !!streaming;

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
    </main>
  );
}

/**
 * 跟随到底:窗口滚动到底部附近视为「贴底」,内容增高(流式、新消息)时自动滚到底;
 * 用户主动上滑离开底部即停止跟随,并暴露 atBottom 供「回到底部」按钮判定。
 */
function useStickToBottom() {
  const sectionRef = useRef<HTMLElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const THRESHOLD = 120;
    function compute() {
      const doc = document.documentElement;
      const near = window.innerHeight + window.scrollY >= doc.scrollHeight - THRESHOLD;
      atBottomRef.current = near;
      setAtBottom(near);
    }
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) {
      return;
    }
    // 内容区高度变化(打字机逐字、新消息)时,只有仍贴底才跟随,尊重用户上滑。
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) {
        window.scrollTo({ top: document.documentElement.scrollHeight });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollToBottom = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: reduce ? "auto" : "smooth",
    });
  }, []);

  return { sectionRef, atBottom, scrollToBottom };
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

/**
 * 打字机揭示:target 只增(delta 追加),逐帧把已显示长度推向 target。
 * 落后越多每帧吐越多,避免模型一次吐一大段时「跳段」或拖尾;追上即停帧。
 * prefers-reduced-motion 下直接全量,不做动画。
 */
function useTypewriter(target: string): string {
  const [shown, setShown] = useState(0);
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    if (reduce) {
      setShown(target.length);
      return;
    }
    let frame = 0;
    let cancelled = false;
    function step() {
      if (cancelled) {
        return;
      }
      let done = false;
      setShown((cur) => {
        if (cur >= target.length) {
          done = true;
          return cur;
        }
        const remaining = target.length - cur;
        const next = Math.min(target.length, cur + Math.max(1, Math.floor(remaining / 6)));
        done = next >= target.length;
        return next;
      });
      if (!done) {
        frame = requestAnimationFrame(step);
      }
    }
    frame = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [target, reduce]);

  return reduce ? target : target.slice(0, shown);
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

/** 生成中的回答:检索提示 + 打字机正文 + 墨色光标。 */
function StreamingAnswer({ streaming }: { streaming: StreamingState }) {
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

/** 助手回答:墨字直接书写在纸面,结论处朱红上标锚点,点击弹出引用原文。 */
function AssistantPassage({ message, onRetry }: { message: MessageItem; onRetry: () => void }) {
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
        />
      ) : null}
    </div>
  );
}

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
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  const re = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: 正则迭代惯用法
  while ((match = re.exec(content)) !== null) {
    const n = Number(match[1]);
    // citations 已按 position 升序,数组下标 n-1 即第 n 条引用。
    const citation = citations[n - 1];
    if (match.index > cursor) {
      parts.push(<span key={key++}>{content.slice(cursor, match.index)}</span>);
    }
    if (citation) {
      const active = openId === citation.id;
      parts.push(
        <button
          key={key++}
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
        </button>,
      );
    } else {
      parts.push(<span key={key++}>{match[0]}</span>);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) {
    parts.push(<span key={key++}>{content.slice(cursor)}</span>);
  }

  return <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-ink">{parts}</p>;
}

/**
 * 引用 popover:portal 到 body,固定定位在锚点附近(下方优先,不够则翻到上方),
 * 随滚动/缩放重新定位;点击外部或 Esc 关闭。展示可核对的原文与支撑结论。
 */
function CitationPopover({
  citation,
  anchor,
  onClose,
}: {
  citation: CitationItem;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function place() {
      const el = ref.current;
      if (!el) {
        return;
      }
      const a = anchor.getBoundingClientRect();
      const ph = el.offsetHeight;
      const pw = el.offsetWidth;
      const margin = 8;
      const below = window.innerHeight - a.bottom;
      const top =
        below < ph + margin && a.top > ph + margin ? a.top - ph - margin : a.bottom + margin;
      const left = Math.max(
        margin,
        Math.min(a.left + a.width / 2 - pw / 2, window.innerWidth - pw - margin),
      );
      setPos({ top, left });
    }
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`引用原文${citation.pageStart != null ? `,第 ${citation.pageStart} 页` : ""}`}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-50 w-[min(20rem,calc(100vw-1rem))] space-y-1.5 rounded-md border border-hairline bg-paper px-3.5 py-2.5 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.22)]"
    >
      {citation.pageStart != null ? (
        <p className="text-xs text-seal tabular-nums">第 {citation.pageStart} 页</p>
      ) : null}
      <blockquote className="border-l-2 border-seal pl-2.5 text-sm leading-[1.7] text-ink-soft">
        “{citation.quote}”
      </blockquote>
      {citation.claim ? <p className="text-xs text-ink-faint">支撑:{citation.claim}</p> : null}
    </div>,
    document.body,
  );
}
