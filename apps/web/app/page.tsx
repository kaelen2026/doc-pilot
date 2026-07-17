"use client";

import { authClient } from "../lib/auth-client";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

export default function HomePage() {
  const { data, isPending } = authClient.useSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6">
      <header className={`space-y-5 ${rise}`}>
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-sm bg-seal pt-0.5 font-display text-xl leading-none text-paper-raised shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
          >
            档
          </span>
          <h1 className="font-display text-5xl font-medium tracking-[-0.022em]">DocPilot</h1>
        </div>
        <p className="text-sm text-ink-faint">Phase 2 · 认证与 Workspace</p>
      </header>

      <p
        className={`max-w-[36rem] text-lg leading-[1.75] text-ink-soft text-pretty ${rise}`}
        style={{ animationDelay: "100ms" }}
      >
        AI 文档工作台：上传 PDF，解析、切片、向量化、摘要，再基于文档做带页码引用的问答。
      </p>

      <div className={rise} style={{ animationDelay: "200ms" }}>
        {isPending ? (
          <p className="text-sm text-ink-faint">加载会话…</p>
        ) : data ? (
          <div className="flex items-center gap-4">
            <p className="text-sm text-ink-soft">
              已登录：<span className="font-medium text-ink">{data.user.email}</span>
            </p>
            <button
              type="button"
              onClick={() => authClient.signOut().then(() => window.location.reload())}
              className="rounded-md border border-hairline bg-paper-raised px-3 py-1.5 text-sm text-ink-soft shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-[color,border-color,transform] duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:border-ink-faint [@media(hover:hover)]:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
            >
              退出登录
            </button>
          </div>
        ) : (
          <a
            href="/login"
            className="inline-block w-fit rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-paper-raised shadow-[0_1px_3px_rgba(0,0,0,0.16)] transition-[background-color,transform] duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
          >
            邮箱验证码登录
          </a>
        )}
      </div>
    </main>
  );
}
