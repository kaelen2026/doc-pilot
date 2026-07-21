"use client";

import { FileText, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** 命中即高亮:精确匹配或作为前缀(子路由也算在该区)。 */
  match: (pathname: string) => boolean;
};

const ITEMS: NavItem[] = [
  {
    href: "/documents",
    label: "我的文档",
    Icon: FileText,
    match: (p) => p === "/documents" || p.startsWith("/documents/"),
  },
  {
    href: "/account",
    label: "设置",
    Icon: Settings,
    match: (p) => p === "/account" || p.startsWith("/account/"),
  },
];

/**
 * 侧栏主导航。展示组件:只读 collapsed,自己读 pathname 做高亮(pathname 是路由信号非业务态)。
 * 折叠时收成居中图标,label 转 title/aria-label 保留可达性。
 */
export function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-2" aria-label="主导航">
      {ITEMS.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? label : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              collapsed && "justify-center px-0",
              active
                ? "bg-accent font-medium text-ink"
                : "text-ink-soft [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {collapsed ? null : <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
