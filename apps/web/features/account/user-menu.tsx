"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { ThemeChoice } from "../theme/theme";
import { useTheme } from "../theme/use-theme";
import { useSignOut } from "./use-sign-out";
import { useUserMenu } from "./use-user-menu";

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
  "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm text-ink-soft transition-colors duration-150 [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground outline-none focus-visible:bg-accent focus-visible:text-accent-foreground";

/**
 * 头部头像下拉菜单:把散落在各页头部的「主题切换 / 退出登录」收进来,并给出
 * 「账户设置」入口(/account)。开合/外点关闭/Escape 由 useUserMenu 承接。
 * 展示组件——自身不持有业务状态(会话读 useSession,主题读 useTheme)。
 */
export function UserMenu() {
  const { data: session } = authClient.useSession();
  const { open, toggle, close, containerRef } = useUserMenu();
  const { choice, cycle } = useTheme();
  const signOut = useSignOut();

  if (!session) {
    return null;
  }

  const name = session.user.name?.trim() || session.user.email;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="账户菜单"
        className="flex size-8 items-center justify-center rounded-full bg-paper-sunken font-medium text-ink-soft text-sm outline-none transition-colors duration-150 [@media(hover:hover)]:hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {initial(name)}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 origin-top-right rounded-lg border border-hairline bg-card p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] animate-[rise_0.16s_cubic-bezier(0.2,0,0,1)_both]"
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
