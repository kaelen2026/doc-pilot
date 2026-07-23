import {
  type ApnsClient,
  buildAlertPayload,
  type PushTarget,
  sendToDevices,
} from "@doc-pilot/push";

/**
 * 发角标推送所需的依赖(注入,便于单测):APNS client、按用户查设备、按 (workspace, user)
 * 计未读、清除失效令牌。接线在 apps/worker/src/index.ts(缺 APNS 配置时整条通路不接)。
 */
export interface BadgePushDeps {
  client: ApnsClient;
  listDevices: (userId: string) => Promise<PushTarget[]>;
  countUnread: (params: { workspaceId: string; userId: string }) => Promise<number>;
  deleteInvalidTokens: (tokens: string[]) => Promise<void>;
}

/**
 * 给一条通知的收件人发 APNS,`badge = 其未读数`——设备离线/后台时,这是唯一能更新应用角标
 * 的通道(在线时由 iOS 端 SSE + 前台重同步维护)。无设备则不空发。失效令牌顺带清除。
 * best-effort:调用方(处理器)包 try/catch,发送失败不影响文档处理成败。
 */
export async function sendBadgePush(
  deps: BadgePushDeps,
  input: { workspaceId: string; userId: string; title: string; body: string | null },
): Promise<void> {
  const devices = await deps.listDevices(input.userId);
  if (devices.length === 0) {
    return;
  }
  const unread = await deps.countUnread({ workspaceId: input.workspaceId, userId: input.userId });
  const payload = buildAlertPayload({
    title: input.title,
    body: input.body ?? undefined,
    badge: unread,
    data: { type: "document" },
  });
  const { invalidTokens } = await sendToDevices({ client: deps.client, devices, payload });
  await deps.deleteInvalidTokens(invalidTokens);
}
