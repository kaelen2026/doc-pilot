"use client";

import type { ReactNode } from "react";
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

  if (isPending || !session) {
    return <>{children}</>;
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
