import { NOTIFICATION_HEARTBEAT_MS, NOTIFICATION_SSE_EVENTS } from "@doc-pilot/contracts";
import { errToLog, logger, sseGauge } from "@doc-pilot/observability";
import type { NotificationBus } from "@doc-pilot/queue";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../../shared/types";
import { activeWorkspaceId } from "../../shared/workspace";
import { parseLimit, serializeNotification } from "./notification.schema";
import {
  getNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification.service";

/**
 * 通知中心路由。bus 依赖注入:index.ts 注入 Redis 实现,单测默认内存实现(不连 Redis)。
 * 送达采用「SSE 实时脉冲 + 连上补齐」:/stream 连上先推 snapshot(未读数),再随脉冲推
 * created;持久事实源始终是 DB,故脉冲丢失由重连补齐兜底(见 notifications schema 注释)。
 */
export function createNotificationRoutes(deps: { bus: NotificationBus }) {
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const rows = await listNotifications({
        workspaceId,
        userId: c.get("user").id,
        limit: parseLimit(c.req.query("limit")),
      });
      return c.json({ notifications: rows.map(serializeNotification) });
    })
    .get("/unread-count", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const count = await getUnreadCount({ workspaceId, userId: c.get("user").id });
      return c.json({ count });
    })
    .post("/read-all", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const updated = await markAllNotificationsRead({ workspaceId, userId: c.get("user").id });
      return c.json({ updated });
    })
    .post("/:id/read", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      await markNotificationRead({
        workspaceId,
        userId: c.get("user").id,
        id: c.req.param("id"),
      });
      return c.json({ ok: true });
    })
    .get("/stream", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const userId = c.get("user").id;

      return streamSSE(c, async (stream) => {
        // 串行化写:脉冲回调与心跳可能并发,链式化避免交错写同一流。
        let chain: Promise<void> = Promise.resolve();
        const write = (event: string, data: unknown): Promise<void> => {
          chain = chain
            .then(() => stream.writeSSE({ event, data: JSON.stringify(data) }))
            .catch(() => {}); // 连接已断的写失败无需处理,onAbort 会收尾。
          return chain;
        };

        sseGauge.inc(); // active_sse_connections(§29.2)
        let unsubscribe: () => Promise<void> = async () => {};
        const heartbeat = setInterval(() => {
          void write(NOTIFICATION_SSE_EVENTS.heartbeat, {});
        }, NOTIFICATION_HEARTBEAT_MS);

        try {
          // 连上补齐:当前未读数(断线重连的补偿点;完整列表由 GET / 提供)。
          const unreadCount = await getUnreadCount({ workspaceId, userId });
          await write(NOTIFICATION_SSE_EVENTS.snapshot, { unreadCount });

          unsubscribe = await deps.bus.subscribe(workspaceId, (pulse) => {
            // 频道按 workspace 分片,再按收件人过滤:只推给对应用户的连接。
            if (pulse.userId !== userId) {
              return;
            }
            void (async () => {
              try {
                const row = await getNotification({ workspaceId, userId, id: pulse.id });
                if (row) {
                  await write(NOTIFICATION_SSE_EVENTS.created, serializeNotification(row));
                }
              } catch (err) {
                logger.error("notification.stream_push_failed", errToLog(err));
              }
            })();
          });

          // 阻塞到客户端断开,期间保持连接打开。
          await new Promise<void>((resolve) => {
            stream.onAbort(() => resolve());
          });
        } finally {
          clearInterval(heartbeat);
          await unsubscribe();
          sseGauge.dec();
        }
      });
    });
}
