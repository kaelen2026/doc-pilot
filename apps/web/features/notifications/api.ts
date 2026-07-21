import { NOTIFICATION_SSE_EVENTS } from "@doc-pilot/contracts";
import { apiFetch, requireOk } from "@/lib/api-client";
import type { NotificationItem, NotificationStreamEvent } from "./types";

export async function fetchNotifications(limit: number): Promise<NotificationItem[]> {
  const r = await requireOk(await apiFetch(`/notifications?limit=${limit}`));
  const { notifications } = (await r.json()) as { notifications: NotificationItem[] };
  return notifications;
}

export async function fetchUnreadCount(): Promise<number> {
  const r = await requireOk(await apiFetch(`/notifications/unread-count`));
  const { count } = (await r.json()) as { count: number };
  return count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await requireOk(await apiFetch(`/notifications/${id}/read`, { method: "POST" }));
}

export async function markAllNotificationsRead(): Promise<void> {
  await requireOk(await apiFetch(`/notifications/read-all`, { method: "POST" }));
}

/**
 * 消费通知 SSE 流(送达实时化)。用手写 fetch + ReadableStream 解析(而非 EventSource):
 * 与 chat 的 streamAnswer 同款,因需带 cookie 凭证。连上先收 snapshot(未读数),
 * 之后每条新通知一个 created 事件;heartbeat 仅保活。断线重连由调用方(hook)负责。
 */
export async function* streamNotifications(
  signal?: AbortSignal,
): AsyncGenerator<NotificationStreamEvent> {
  const r = await apiFetch(`/notifications/stream`, { signal });
  if (!r.ok || !r.body) {
    throw new Error(`HTTP ${r.status}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseFrame(frame);
        if (parsed) {
          yield parsed;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** 解析单个 SSE 帧为通知事件。事件名/形状不符时返回 null。 */
function parseFrame(frame: string): NotificationStreamEvent | null {
  let event = "";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!event || dataLines.length === 0) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
  if (event === NOTIFICATION_SSE_EVENTS.snapshot) {
    const unreadCount = (data as { unreadCount?: number }).unreadCount;
    return typeof unreadCount === "number" ? { kind: "snapshot", unreadCount } : null;
  }
  if (event === NOTIFICATION_SSE_EVENTS.created) {
    return { kind: "created", notification: data as NotificationItem };
  }
  if (event === NOTIFICATION_SSE_EVENTS.heartbeat) {
    return { kind: "heartbeat" };
  }
  return null;
}
