"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, notificationHref } from "@/features/notifications/format-notification";
import type { NotificationItem } from "@/features/notifications/types";
import { useNotifications } from "@/features/notifications/use-notifications";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// 图标沿用仓库约定:内联 SVG + currentColor + stroke,尺寸由 Button 的 [&_svg] 归一到 size-4。
function BellIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="presentation"
      aria-hidden="true"
    >
      <path d="M8 2a3.25 3.25 0 0 0-3.25 3.25c0 2.7-.8 3.9-1.35 4.5h9.2c-.55-.6-1.35-1.8-1.35-4.5A3.25 3.25 0 0 0 8 2Z" />
      <path d="M6.6 12.25a1.4 1.4 0 0 0 2.8 0" />
    </svg>
  );
}

/**
 * 通知中心入口:铃铛 + 未读计数(seal 变体 Badge),点开锚定下拉面板。
 * 全站侧栏顶部操作簇共用(见 features/shell/sidebar)。仅登录后渲染。
 */
export function NotificationBell() {
  const { data: session } = authClient.useSession();
  const enabled = !!session;
  const { notifications, unreadCount, isLoading, isError, markRead, markAllRead } =
    useNotifications(enabled);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  if (!enabled) {
    return null;
  }

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={anchorRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `通知,${unreadCount} 条未读` : "通知"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="通知"
      >
        <BellIcon />
      </Button>
      {unreadCount > 0 ? (
        <Badge
          variant="seal"
          aria-hidden="true"
          className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 justify-center rounded-full px-1 py-0 text-[10px] leading-4"
        >
          {badgeText}
        </Badge>
      ) : null}
      {open && anchorRef.current ? (
        <NotificationPanel
          anchor={anchorRef.current}
          notifications={notifications}
          unreadCount={unreadCount}
          isLoading={isLoading}
          isError={isError}
          onClose={() => setOpen(false)}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
        />
      ) : null}
    </div>
  );
}

/** 锚定 portal 面板:定位/关闭逻辑照 citation-popover,右对齐铃铛下方。 */
function NotificationPanel({
  anchor,
  notifications,
  unreadCount,
  isLoading,
  isError,
  onClose,
  onMarkRead,
  onMarkAllRead,
}: {
  anchor: HTMLElement;
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function place() {
      const el = ref.current;
      if (!el) {
        return;
      }
      const a = anchor.getBoundingClientRect();
      const pw = el.offsetWidth;
      const margin = 8;
      // 铃铛在左侧栏顶部,故左对齐铃铛、向右展开;右溢出时整体左移夹回视口内。
      const top = a.bottom + margin;
      const left = Math.max(margin, Math.min(a.left, window.innerWidth - pw - margin));
      setPos({ top, left });
    }
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  function onItemClick(n: NotificationItem) {
    if (!n.read) {
      onMarkRead(n.id);
    }
    const href = notificationHref(n);
    onClose();
    if (href) {
      router.push(href);
    }
  }

  const now = Date.now();

  function renderBody() {
    if (isLoading) {
      return <p className="px-3 py-6 text-center text-ink-faint text-sm">加载通知…</p>;
    }
    if (isError) {
      return <p className="px-3 py-6 text-center text-seal text-sm">通知加载失败</p>;
    }
    if (notifications.length === 0) {
      return <p className="px-3 py-6 text-center text-ink-faint text-sm">暂无通知</p>;
    }
    return (
      <ul className="divide-y divide-hairline">
        {notifications.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onItemClick(n)}
              className="block w-full px-3.5 py-3 text-left transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring [@media(hover:hover)]:hover:bg-paper-sunken"
            >
              <div className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : "bg-seal",
                  )}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p
                    className={cn(
                      "truncate text-sm",
                      n.read ? "text-ink-soft" : "font-medium text-ink",
                    )}
                  >
                    {n.title}
                  </p>
                  {n.body ? (
                    <p className="line-clamp-2 text-ink-faint text-xs leading-[1.6]">{n.body}</p>
                  ) : null}
                  <p className="text-ink-faint text-[11px] tabular-nums">
                    {formatRelativeTime(n.createdAt, now)}
                  </p>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="通知"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed z-50 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-hairline bg-paper shadow-paper-2xl animate-[rise_0.2s_cubic-bezier(0.2,0,0,1)_both]"
    >
      <div className="flex items-center justify-between border-hairline border-b px-3.5 py-2.5">
        <span className="font-medium text-ink text-sm">通知</span>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="rounded-sm text-seal text-xs underline-offset-4 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:text-ink-faint disabled:no-underline [@media(hover:hover)]:hover:text-seal-deep [@media(hover:hover)]:hover:underline"
        >
          全部已读
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">{renderBody()}</div>
    </div>,
    document.body,
  );
}
