"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useMe } from "@/features/account/use-me";
import { Sidebar } from "@/features/shell/sidebar";
import { useSidebar } from "@/features/shell/use-sidebar";
import { authClient } from "@/lib/auth-client";

/**
 * 工作台外壳布局:左侧常驻侧栏 + 右侧内容区。覆盖文档列表 / 阅读 / 问答 / 设置。
 * 未登录或会话解析中不挂侧栏,children 全宽渲染——登录门禁由各页自持(与重构前一致)。
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const { collapsed, toggle } = useSidebar();
  const meQuery = useMe(!!session);
  const router = useRouter();

  // 冷静期冻结:处于注销冷静期的账户,所有工作台页面一律踢到「恢复账户」页(/restore 在本
  // route group 之外,不经此 layout,故不会自我循环)。「绝不信前端」——后端 requireActiveAccount
  // 仍会硬挡业务端点,这里只是 UX 层的即时重定向。
  const pendingDeletion = !!meQuery.data?.deletionScheduledAt;
  useEffect(() => {
    if (pendingDeletion) {
      router.replace("/restore");
    }
  }, [pendingDeletion, router]);

  if (isPending || !session) {
    return <>{children}</>;
  }
  if (pendingDeletion) {
    return null; // 重定向进行中,别闪一下工作台。
  }

  // 外壳占满视口高度且自身不滚动;侧栏是等高 flex 子项(固定,不随内容滚动),
  // 只有右侧内容区内部滚动——标准工作台布局。内容区用 div(各页自带 <main>,不嵌套)。
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="min-w-0 flex-1 overflow-y-auto max-md:pl-14">{children}</div>
    </div>
  );
}
