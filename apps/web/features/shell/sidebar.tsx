"use client";

import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { SealMark } from "@/components/seal-mark";
import { useMe } from "@/features/account/use-me";
import { openCommandPalette } from "@/features/search/use-command-palette";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { SidebarAccount } from "./sidebar-account";
import { SidebarDocs } from "./sidebar-docs";
import { SidebarNav } from "./sidebar-nav";

/**
 * 工作台左侧栏(编排壳)。自上而下:品牌 + 折叠钮 → ⌘K 搜索 + 通知铃 → 主导航 →
 * 文档快切 → 底部账户。折叠态收成窄图标栏。折叠状态由 use-sidebar 提供,这里只读。
 * 会话门禁下放到各子件(未登录时账户/铃铛自渲染为空,文档查询禁用)。
 */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { data: session } = authClient.useSession();
  const enabled = !!session;
  // 平台管理员标志(GET /me,react-query 缓存,与设置页共用 ["me"] 查询)决定是否显示后台入口。
  const { data: me } = useMe(enabled);

  return (
    <div
      className={cn(
        "z-40 flex h-full shrink-0 flex-col gap-3 border-hairline border-r bg-paper-sunken py-3 transition-[width] duration-200 ease-out max-md:absolute max-md:inset-y-0 max-md:left-0",
        collapsed ? "w-14" : "w-60",
      )}
    >
      {/* 品牌 + 折叠钮 */}
      <div
        className={cn("flex items-center px-3", collapsed ? "justify-center" : "justify-between")}
      >
        {collapsed ? null : (
          <div className="flex items-center gap-2 pl-1">
            <SealMark className="size-7 text-sm" />
            <span className="font-display font-medium text-base tracking-[-0.01em]">DocPilot</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
          aria-expanded={!collapsed}
          title={collapsed ? "展开侧栏" : "折叠侧栏"}
          className="flex size-7 items-center justify-center rounded-md text-ink-faint outline-none transition-colors duration-150 [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {/* ⌘K 搜索 + 通知铃 */}
      {enabled ? (
        <div className={cn("flex items-center gap-1 px-2", collapsed && "flex-col")}>
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="搜索"
            title="搜索 (⌘K)"
            className={cn(
              "flex items-center rounded-md border border-hairline bg-paper text-ink-soft text-sm outline-none transition-colors duration-150 [@media(hover:hover)]:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              collapsed ? "size-9 justify-center" : "h-9 flex-1 justify-between gap-2 px-2.5",
            )}
          >
            <span className="flex items-center gap-2">
              <Search className="size-4 shrink-0" />
              {collapsed ? null : <span>搜索</span>}
            </span>
            {collapsed ? null : <kbd className="text-ink-faint text-xs">⌘K</kbd>}
          </button>
          <NotificationBell />
        </div>
      ) : null}

      <SidebarNav collapsed={collapsed} isAdmin={me?.isAdmin ?? false} />

      <SidebarDocs collapsed={collapsed} enabled={enabled} />

      <div className="border-hairline border-t pt-2">
        <SidebarAccount collapsed={collapsed} />
      </div>
    </div>
  );
}
