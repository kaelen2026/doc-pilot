"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SealMark } from "@/components/seal-mark";
import { Button } from "@/components/ui/button";
import { authClient } from "../lib/auth-client";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

export default function HomePage() {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    await authClient.signOut();
    // useSession 会响应式翻到登出态；这里只需清掉 React Query 里缓存的用户数据。
    queryClient.clear();
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6">
      <header className={`space-y-5 ${rise}`}>
        <div className="flex items-center gap-3.5">
          <SealMark className="size-10 text-xl" />
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
            <Button variant="outline" size="sm" onClick={signOut}>
              退出登录
            </Button>
          </div>
        ) : (
          <Button asChild>
            <Link href="/login">邮箱验证码登录</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
