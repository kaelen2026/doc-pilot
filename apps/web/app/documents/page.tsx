"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

interface DocItem {
  id: string;
  title: string;
  status: string;
  currentStage: string | null;
  progress: number;
  pageCount: number | null;
  sizeBytes: number;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending_upload: "待上传",
  uploaded: "已上传",
  queued: "排队中",
  processing: "处理中",
  ready: "就绪",
  partially_ready: "部分就绪",
  failed: "失败",
  deleting: "删除中",
  deleted: "已删除",
};

const STAGE_LABEL: Record<string, string> = {
  validate: "校验",
  parse: "解析",
  clean: "清洗",
  chunk: "切片",
  embed: "向量化",
  summarize: "摘要",
  finalize: "收尾",
};

// 处理中的文档需要轮询,直到进入终态。
const IN_FLIGHT = new Set(["queued", "processing", "deleting"]);

export default function DocumentsPage() {
  const { data, isPending } = authClient.useSession();
  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`${API}/documents`, { credentials: "include" });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }
    const j = (await r.json()) as { documents: DocItem[] };
    setDocs(j.documents);
    return j.documents;
  }, []);

  useEffect(() => {
    if (!data) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        const list = await load();
        if (cancelled) {
          return;
        }
        // 仍有在途文档 → 继续轮询,状态可观察。
        if (list.some((d) => IN_FLIGHT.has(d.status))) {
          timer = setTimeout(tick, 2000);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      }
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [data, load]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <header className={`space-y-2 ${rise}`}>
        <h1 className="font-display text-3xl font-medium tracking-[-0.018em]">我的文档</h1>
        <p className="text-sm text-ink-faint">Phase 4 · 解析流水线</p>
      </header>

      <section className={rise} style={{ animationDelay: "100ms" }}>
        {isPending ? (
          <p className="text-sm text-ink-faint">加载会话…</p>
        ) : !data ? (
          <a
            href="/login"
            className="inline-block w-fit rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-paper-raised shadow-[0_1px_3px_rgba(0,0,0,0.16)] transition-[background-color,transform] duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
          >
            请先登录
          </a>
        ) : error ? (
          <p className="text-sm text-seal">{error}</p>
        ) : docs === null ? (
          <p className="text-sm text-ink-faint">加载文档…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm leading-[1.7] text-ink-soft">
            还没有文档。上传功能将在后续阶段接入。
          </p>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-paper-raised">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-col gap-1.5 px-4 py-3.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="truncate text-sm text-ink">{d.title}</span>
                  <span className="shrink-0 rounded-sm bg-paper-sunken px-2 py-0.5 text-xs text-ink-soft tabular-nums">
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </div>
                {d.status === "processing" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-faint tabular-nums">
                      {STAGE_LABEL[d.currentStage ?? ""] ?? d.currentStage ?? "处理中"} ·{" "}
                      {d.progress}%
                    </span>
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-paper-sunken">
                      <span
                        className="block h-full rounded-full bg-ink transition-[width] duration-500"
                        style={{ width: `${d.progress}%` }}
                      />
                    </span>
                  </div>
                ) : d.status === "ready" && d.pageCount ? (
                  <span className="text-xs text-ink-faint tabular-nums">{d.pageCount} 页</span>
                ) : d.status === "failed" ? (
                  <span className="text-xs text-seal">处理失败</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <a
        href="/"
        className="w-fit text-sm text-ink-faint transition-colors duration-150 [@media(hover:hover)]:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
      >
        返回首页
      </a>
    </main>
  );
}
