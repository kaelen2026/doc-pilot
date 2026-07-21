import { type NotificationRow, scopedNotificationRepo } from "./notification.repository";

/** 收件箱列表(按收件人,时间倒序)。 */
export async function listNotifications(params: {
  workspaceId: string;
  userId: string;
  limit: number;
}): Promise<NotificationRow[]> {
  return scopedNotificationRepo(params.workspaceId).list({
    userId: params.userId,
    limit: params.limit,
  });
}

export async function getUnreadCount(params: {
  workspaceId: string;
  userId: string;
}): Promise<number> {
  return scopedNotificationRepo(params.workspaceId).countUnread({ userId: params.userId });
}

/** 供 SSE 脉冲回查单条通知并序列化(作用域过滤天然拦截越权脉冲)。 */
export async function getNotification(params: {
  workspaceId: string;
  userId: string;
  id: string;
}): Promise<NotificationRow | null> {
  return scopedNotificationRepo(params.workspaceId).getById({
    userId: params.userId,
    id: params.id,
  });
}

export async function markNotificationRead(params: {
  workspaceId: string;
  userId: string;
  id: string;
}): Promise<void> {
  await scopedNotificationRepo(params.workspaceId).markRead({
    userId: params.userId,
    id: params.id,
  });
}

export async function markAllNotificationsRead(params: {
  workspaceId: string;
  userId: string;
}): Promise<number> {
  return scopedNotificationRepo(params.workspaceId).markAllRead({ userId: params.userId });
}
