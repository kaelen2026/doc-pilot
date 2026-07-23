"use client";

import Link from "next/link";
import { SealMark } from "@/components/seal-mark";
import { authClient } from "@/lib/auth-client";

/**
 * 公开页(个人主页 / 关注列表)顶栏。这些页在 (workspace) 外壳之外、拿不到侧栏,
 * 故这里补一条轻量回程:品牌回首页,已登录用户额外给「返回工作台」直达 /documents,
 * 未登录访客给「登录」。会话解析中(session 为 undefined)先按未登录渲染,解析完再切换。
 * 不套完整工作台外壳——公开页面向匿名访客,只需一条回程链接即可。
 */
export function PublicTopBar() {
  const { data: session } = authClient.useSession();

  return (
    <header className="flex items-center justify-between border-hairline border-b px-6 py-3">
      <Link
        href={session ? "/documents" : "/"}
        aria-label="DocPilot 首页"
        className="flex items-center gap-2 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <SealMark className="size-7 text-sm" />
        <span className="font-display font-medium text-base tracking-[-0.01em]">DocPilot</span>
      </Link>
      <Link
        href={session ? "/documents" : "/login"}
        className="rounded-md px-2.5 py-1.5 text-ink-soft text-sm outline-none transition-colors duration-150 [@media(hover:hover)]:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {session ? "返回工作台" : "登录"}
      </Link>
    </header>
  );
}
