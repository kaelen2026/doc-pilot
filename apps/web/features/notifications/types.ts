/** 通知 DTO,形状与后端 serializeNotification 一致(列表端点与 SSE created 事件共用)。 */
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

/** /notifications/stream 的 SSE 事件(事件名绑定 @doc-pilot/contracts 的 NOTIFICATION_SSE_EVENTS)。 */
export type NotificationStreamEvent =
  | { kind: "snapshot"; unreadCount: number }
  | { kind: "created"; notification: NotificationItem }
  | { kind: "heartbeat" };
