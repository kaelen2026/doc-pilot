"use client";

import { authClient } from "../lib/auth-client";

export default function HomePage() {
  const { data, isPending } = authClient.useSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div className="space-y-3">
        <p className="text-sm font-medium text-neutral-400">Phase 2 · 认证与 Workspace</p>
        <h1 className="text-4xl font-semibold tracking-tight">DocPilot</h1>
        <p className="text-lg text-neutral-300">
          AI 文档工作台 — 上传 PDF，解析、切片、向量化、摘要，再基于文档做带页码引用的问答。
        </p>
      </div>

      {isPending ? (
        <p className="text-sm text-neutral-500">加载会话…</p>
      ) : data ? (
        <div className="flex items-center gap-4">
          <p className="text-sm text-neutral-300">
            已登录：<span className="font-medium">{data.user.email}</span>
          </p>
          <button
            type="button"
            onClick={() => authClient.signOut().then(() => window.location.reload())}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300"
          >
            退出登录
          </button>
        </div>
      ) : (
        <a
          href="/login"
          className="w-fit rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
        >
          邮箱验证码登录
        </a>
      )}
    </main>
  );
}
