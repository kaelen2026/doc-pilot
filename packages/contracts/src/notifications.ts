/**
 * 通知中心的稳定契约:类型、关联资源、SSE 事件名、分页、心跳、Redis 频道名。
 * Web / API / Worker 三方引用,避免类型名与事件名等魔法字符串漂移(参照 chat.ts)。
 *
 * 说明:通知的持久事实源是 DB 的 notifications 行(由 Worker 在文档终态的同一事务写入);
 * Redis pub/sub 只做实时脉冲(best-effort)。SSE 连上时先补齐未读、断线重连再补齐,
 * 故脉冲丢失不会造成永久丢通知(见 API notification.routes 的 /stream)。
 */

/** 通知类型。v1 只有文档处理终态两类(ready / failed)。VARCHAR + 应用层校验,不用 PG ENUM。 */
export const NOTIFICATION_TYPE = {
  documentReady: "document.ready",
  documentFailed: "document.failed",
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

/** 通知关联的资源类型(点击跳转用)。MVP 仅文档。 */
export const NOTIFICATION_RESOURCE = {
  document: "document",
} as const;
export type NotificationResource =
  (typeof NOTIFICATION_RESOURCE)[keyof typeof NOTIFICATION_RESOURCE];

/**
 * SSE 事件名。
 * - snapshot:连上即推当前未读数(断线重连的补偿点;真相仍在 GET 列表)。
 * - created:增量新通知(payload 为序列化后的通知 DTO,形状同列表项)。
 * - heartbeat:周期性保活注释帧,防中间层掐断空闲连接。
 */
export const NOTIFICATION_SSE_EVENTS = {
  snapshot: "notification.snapshot",
  created: "notification.created",
  heartbeat: "notification.heartbeat",
} as const;
export type NotificationSSEEvent =
  (typeof NOTIFICATION_SSE_EVENTS)[keyof typeof NOTIFICATION_SSE_EVENTS];

/** 通知列表分页:默认窗口大小与服务端单次返回上限(防御异常大的 limit)。 */
export const NOTIFICATION_PAGE = {
  size: 20,
  max: 50,
} as const;

/** SSE 心跳间隔(ms)。 */
export const NOTIFICATION_HEARTBEAT_MS = 25_000;

/**
 * Redis pub/sub 频道:按 workspace 分片。Worker 提交终态后 publish 脉冲,
 * API 的 /stream 订阅对应 workspace 频道,再按收件人 userId 过滤后推给客户端。
 */
export function notificationChannel(workspaceId: string): string {
  return `notif:ws:${workspaceId}`;
}
