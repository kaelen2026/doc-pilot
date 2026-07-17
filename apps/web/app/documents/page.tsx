"use client";

import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

interface DocItem {
  id: string;
  title: string;
  status: string;
  sizeBytes: number;
  createdAt: string;
}

export default function DocumentsPage() {
  const { data, isPending } = authClient.useSession();
  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) {
      return;
    }
    fetch(`${API}/documents`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json() as Promise<{ documents: DocItem[] }>;
      })
      .then((j) => setDocs(j.documents))
      .catch((e) => setError(String(e)));
  }, [data]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <header className={`space-y-2 ${rise}`}>
        <h1 className="font-display text-3xl font-medium tracking-[-0.018em]">我的文档</h1>
        <p className="text-sm text-ink-faint">Phase 3 · 文件上传</p>
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
              <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <span className="truncate text-sm text-ink">{d.title}</span>
                <span className="shrink-0 rounded-sm bg-paper-sunken px-2 py-0.5 text-xs text-ink-soft tabular-nums">
                  {d.status}
                </span>
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
