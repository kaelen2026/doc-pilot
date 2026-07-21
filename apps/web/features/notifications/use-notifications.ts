"use client";

import { NOTIFICATION_PAGE } from "@doc-pilot/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  streamNotifications,
} from "./api";
import type { NotificationItem } from "./types";

const LIST_KEY = ["notifications"] as const;
const COUNT_KEY = ["notifications", "unread-count"] as const;

/**
 * 通知中心控制器:react-query 拉列表 + 未读数,SSE 推增量(送达实时化)。
 * SSE 只作「有新通知 → 失活重取」的信号(服务端是唯一事实源);断线自动退避重连,
 * 重连时服务端补推 snapshot,故脉冲丢失不致永久漏通知。enabled=false(未登录)时不连。
 */
export function useNotifications(enabled: boolean) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => fetchNotifications(NOTIFICATION_PAGE.size),
    enabled,
  });
  const countQuery = useQuery({
    queryKey: COUNT_KEY,
    queryFn: fetchUnreadCount,
    enabled,
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    let controller: AbortController | null = null;
    let retry = 0;

    async function connect() {
      while (!cancelled) {
        controller = new AbortController();
        try {
          for await (const ev of streamNotifications(controller.signal)) {
            if (cancelled) {
              return;
            }
            if (ev.kind === "created") {
              // 失活 ["notifications"] 前缀,列表与未读数一并重取(服务端为准)。
              void queryClient.invalidateQueries({ queryKey: LIST_KEY });
            } else if (ev.kind === "snapshot") {
              queryClient.setQueryData(COUNT_KEY, ev.unreadCount);
            }
          }
          retry = 0; // 正常结束(服务端关闭),重连计数复位。
        } catch {
          // 断线:走下方退避重连。
        }
        if (cancelled) {
          return;
        }
        retry = Math.min(retry + 1, 5);
        await new Promise((resolve) => setTimeout(resolve, 1000 * retry));
      }
    }

    void connect();
    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [enabled, queryClient]);

  const markRead = useCallback(
    async (id: string) => {
      await markNotificationRead(id);
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
    [queryClient],
  );

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  }, [queryClient]);

  const notifications: NotificationItem[] = listQuery.data ?? [];

  return {
    notifications,
    unreadCount: countQuery.data ?? 0,
    isLoading: listQuery.isPending,
    isError: listQuery.isError,
    markRead,
    markAllRead,
  };
}
