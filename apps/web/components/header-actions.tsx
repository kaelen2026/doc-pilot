"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { openCommandPalette } from "@/features/search/use-command-palette";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { authClient } from "@/lib/auth-client";

/**
 * 全站头部操作簇(应用外壳):主题切换 · ⌘K 搜索 · 通知铃铛 · 退出登录。
 * 从 documents-view 抽出,供文档列表 / 问答 / 阅读各页复用——通知中心全站可见的落点。
 * 自身按会话门禁(未登录不渲染),signOut 亦收敛于此。
 */
export function HeaderActions() {
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  if (!session) {
    return null;
  }

  async function signOut() {
    await authClient.signOut();
    queryClient.clear(); // 清掉缓存数据,避免下个账号看到上个账号的内容。
    router.replace("/");
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <ThemeToggle />
      <Button variant="ghost" size="sm" onClick={openCommandPalette}>
        搜索 <kbd className="ml-1.5 text-ink-faint text-xs">⌘K</kbd>
      </Button>
      <NotificationBell />
      <Button variant="outline" size="sm" onClick={signOut}>
        退出登录
      </Button>
    </div>
  );
}
