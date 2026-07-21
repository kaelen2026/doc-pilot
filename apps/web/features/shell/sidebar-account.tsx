"use client";

import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useSignOut } from "@/features/account/use-sign-out";
import { useUserMenu } from "@/features/account/use-user-menu";
import type { ThemeChoice } from "@/features/theme/theme";
import { useTheme } from "@/features/theme/use-theme";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const THEME_LABEL: Record<ThemeChoice, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

/** 姓名/邮箱 → 单字符首字母头像文案。 */
function initial(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

const itemClass =
  "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm text-ink-soft outline-none transition-colors duration-150 [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground";

/**
 * 侧栏底部账户区。等价于原头部 UserMenu(账户设置 / 主题切换 / 退出登录),
 * 但触发器是一整行「头像 + 姓名」,菜单向上弹出(origin-bottom)以贴合底部落点。
 * 折叠时收成居中头像。展示组件——状态读 useSession/useTheme,开合走 useUserMenu。
 */
export function SidebarAccount({ collapsed }: { collapsed: boolean }) {
  const { data: session } = authClient.useSession();
  const { open, toggle, close, containerRef } = useUserMenu();
  const { choice, cycle } = useTheme();
  const signOut = useSignOut();

  if (!session) {
    return null;
  }

  const name = session.user.name?.trim() || session.user.email;
  const avatar = (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-paper-sunken font-medium text-ink-soft text-xs">
      {initial(name)}
    </span>
  );

  return (
    <div ref={containerRef} className="relative px-2">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="账户菜单"
        title={collapsed ? name : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 outline-none transition-colors duration-150 [@media(hover:hover)]:hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          collapsed && "justify-center px-0",
        )}
      >
        {avatar}
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-ink text-sm">{name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-ink-faint" />
          </>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-2 mb-2 w-[calc(100%-1rem)] min-w-52 origin-bottom rounded-lg border border-hairline bg-card p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] animate-[rise_0.16s_cubic-bezier(0.2,0,0,1)_both]"
        >
          <div className="border-hairline border-b px-2.5 pt-1.5 pb-2.5">
            <p className="truncate font-medium text-ink text-sm">{name}</p>
            <p className="truncate text-ink-faint text-xs">{session.user.email}</p>
          </div>
          <div className="pt-1.5">
            <Link href="/account" role="menuitem" className={itemClass} onClick={close}>
              账户设置
            </Link>
            <button type="button" role="menuitem" onClick={cycle} className={itemClass}>
              <span>主题</span>
              <span className="text-ink-faint text-xs">{THEME_LABEL[choice]}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                void signOut();
              }}
              className={cn(itemClass, "text-seal [@media(hover:hover)]:hover:text-seal-deep")}
            >
              退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
