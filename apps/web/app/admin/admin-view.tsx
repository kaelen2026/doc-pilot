"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/features/account/use-me";
import { authClient } from "@/lib/auth-client";
import { OverviewSection } from "./overview-section";
import { PushTestSection } from "./push-test-section";
import { UsageSection } from "./usage-section";
import { UsersSection } from "./users-section";
import { WorkspacesSection } from "./workspaces-section";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

/**
 * 管理后台编排壳。门禁两层:未登录回 /login;已登录但非平台管理员回 /documents。
 * 真正的授权在 API 的 requireAdmin(前端仅 UX)。状态路由用早返回收敛在 renderBody。
 * 后台不在工作台 (workspace) 布局内,故无侧栏,自带返回应用入口。
 */
export function AdminView() {
  const { data: session, isPending } = authClient.useSession();
  const enabled = !!session;
  const meQuery = useMe(enabled);
  const router = useRouter();
  const isAdmin = meQuery.data?.isAdmin ?? false;

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
      return;
    }
    // 会话就绪且确认非管理员时回工作台(不把后台入口暴露给普通用户)。
    if (meQuery.data && !meQuery.data.isAdmin) {
      router.replace("/documents");
    }
  }, [isPending, session, meQuery.data, router]);

  function renderBody() {
    if (isPending || !session || meQuery.isPending) {
      return <p className="text-ink-faint text-sm">加载中…</p>;
    }
    if (meQuery.isError) {
      return <p className="text-seal text-sm">{String(meQuery.error)}</p>;
    }
    if (!isAdmin) {
      return <p className="text-ink-faint text-sm">无访问权限,正在返回…</p>;
    }
    return (
      <div className="space-y-10">
        <OverviewSection enabled={enabled} />
        <UsageSection enabled={enabled} />
        <WorkspacesSection enabled={enabled} />
        <UsersSection enabled={enabled} />
        <PushTestSection />
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-16">
      <header className={rise}>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display font-medium text-3xl tracking-[-0.018em]">管理后台</h1>
          <Link
            href="/documents"
            className="text-ink-faint text-sm outline-none transition-colors duration-150 [@media(hover:hover)]:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            ← 返回应用
          </Link>
        </div>
        <p className="mt-1 text-ink-faint text-sm">平台级只读视图:跨全部工作区的用量、成本与目录</p>
      </header>

      <section className={rise} style={{ animationDelay: "100ms" }}>
        {renderBody()}
      </section>
    </main>
  );
}
