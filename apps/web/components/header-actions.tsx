"use client";

import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/features/account/user-menu";
import { openCommandPalette } from "@/features/search/use-command-palette";
import { authClient } from "@/lib/auth-client";

/**
 * 全站头部操作簇(应用外壳):⌘K 搜索 · 通知铃铛 · 账户菜单。
 * 供文档列表 / 问答 / 阅读各页复用——通知中心全站可见的落点。UserMenu(账户中心)
 * 已收纳主题切换与退出登录,故此处不再重复。自身按会话门禁(未登录不渲染)。
 */
export function HeaderActions() {
  const { data: session } = authClient.useSession();

  if (!session) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="ghost" size="sm" onClick={openCommandPalette}>
        搜索 <kbd className="ml-1.5 text-ink-faint text-xs">⌘K</kbd>
      </Button>
      <NotificationBell />
      <UserMenu />
    </div>
  );
}
