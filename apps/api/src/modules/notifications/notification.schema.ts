import { NOTIFICATION_PAGE } from "@doc-pilot/contracts";
import type { NotificationRow } from "./notification.repository";

/** 解析并夹取列表 limit;非法/缺省回落默认窗口,超上限截断(NOTIFICATION_PAGE)。 */
export function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    return NOTIFICATION_PAGE.size;
  }
  return Math.min(n, NOTIFICATION_PAGE.max);
}

/**
 * 通知行 → 客户端 DTO。列表端点与 SSE `created` 事件共用同一形状(单一序列化真相),
 * 保证实时推送与拉取列表的字段一致。read 由 read_at 是否为空派生。
 */
export function serializeNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    metadata: row.metadata,
    read: row.readAt !== null,
    createdAt: row.createdAt,
  };
}

export type NotificationDTO = ReturnType<typeof serializeNotification>;
