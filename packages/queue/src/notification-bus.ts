import { notificationChannel } from "@doc-pilot/contracts";
import type { Redis } from "ioredis";

/**
 * 通知实时脉冲(best-effort)。持久事实源是 DB 的 notifications 行(Worker 在文档终态事务内写);
 * 这里只把「有新通知」的信号跨进程(Worker → API)推给在线的 SSE 连接。脉冲丢失由客户端
 * 重连时的补齐(snapshot + GET 列表)兜底,故不做持久/重投保证——刻意不走 Outbox(那是给
 * 「绝不能丢的异步任务交接」用的,见 CLAUDE.md 不变量)。
 *
 * 脉冲只带 { id, userId },不带正文:API 订阅到后按 workspace + userId 作用域回查并序列化,
 * 保证推给客户端的形状与 GET 列表一致,且天然复用租户/收件人过滤。
 */
export interface NotificationPulse {
  /** 新通知的行 id。 */
  id: string;
  /** 收件人 user id(API 侧据此过滤,只推给对应用户的连接)。 */
  userId: string;
}

export interface NotificationBus {
  publish(workspaceId: string, pulse: NotificationPulse): Promise<void>;
  /** 订阅某 workspace 的脉冲;返回取消订阅函数(SSE 连接关闭时调用)。 */
  subscribe(
    workspaceId: string,
    handler: (pulse: NotificationPulse) => void,
  ): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

/**
 * 生产实现:Redis pub/sub。发布连接可与其它用途共用;订阅连接一旦进入 subscribe 模式便被
 * 独占,故单独持有一条,并在进程内按频道扇出给多个本地订阅者(每个在线 SSE 连接一个 handler),
 * 避免为每个连接开一条 Redis 连接。
 */
export class RedisNotificationBus implements NotificationBus {
  private readonly publisher: Redis;
  private readonly createSubscriber: () => Redis;
  private subscriber: Redis | null = null;
  private readonly handlers = new Map<string, Set<(pulse: NotificationPulse) => void>>();

  constructor(deps: { publisher: Redis; createSubscriber: () => Redis }) {
    this.publisher = deps.publisher;
    this.createSubscriber = deps.createSubscriber;
  }

  async publish(workspaceId: string, pulse: NotificationPulse): Promise<void> {
    await this.publisher.publish(notificationChannel(workspaceId), JSON.stringify(pulse));
  }

  async subscribe(
    workspaceId: string,
    handler: (pulse: NotificationPulse) => void,
  ): Promise<() => Promise<void>> {
    const channel = notificationChannel(workspaceId);
    const sub = this.ensureSubscriber();

    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      await sub.subscribe(channel);
    }
    set.add(handler);

    return async () => {
      const current = this.handlers.get(channel);
      if (!current) {
        return;
      }
      current.delete(handler);
      if (current.size === 0) {
        this.handlers.delete(channel);
        await this.subscriber?.unsubscribe(channel).catch(() => {});
      }
    };
  }

  async close(): Promise<void> {
    await this.subscriber?.quit().catch(() => {});
    this.subscriber = null;
  }

  private ensureSubscriber(): Redis {
    if (this.subscriber) {
      return this.subscriber;
    }
    const sub = this.createSubscriber();
    sub.on("message", (channel: string, message: string) => {
      const set = this.handlers.get(channel);
      if (!set || set.size === 0) {
        return;
      }
      let pulse: NotificationPulse;
      try {
        pulse = JSON.parse(message) as NotificationPulse;
      } catch {
        return; // 脏消息忽略,不影响连接。
      }
      for (const h of set) {
        h(pulse);
      }
    });
    this.subscriber = sub;
    return sub;
  }
}

/**
 * 单进程内存实现:测试用,以及本地无跨进程需求时的降级。publish 同步扇出给本进程订阅者。
 */
export class InMemoryNotificationBus implements NotificationBus {
  private readonly handlers = new Map<string, Set<(pulse: NotificationPulse) => void>>();

  async publish(workspaceId: string, pulse: NotificationPulse): Promise<void> {
    const set = this.handlers.get(notificationChannel(workspaceId));
    if (set) {
      for (const h of set) {
        h(pulse);
      }
    }
  }

  async subscribe(
    workspaceId: string,
    handler: (pulse: NotificationPulse) => void,
  ): Promise<() => Promise<void>> {
    const channel = notificationChannel(workspaceId);
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    return async () => {
      this.handlers.get(channel)?.delete(handler);
    };
  }

  async close(): Promise<void> {
    this.handlers.clear();
  }
}
