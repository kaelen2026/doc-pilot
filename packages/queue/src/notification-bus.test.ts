import { notificationChannel } from "@doc-pilot/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryNotificationBus,
  type NotificationPulse,
  RedisNotificationBus,
} from "./notification-bus";

const WS = "ws-1";
const pulse = (overrides: Partial<NotificationPulse> = {}): NotificationPulse => ({
  id: "n-1",
  userId: "u-1",
  ...overrides,
});

describe("InMemoryNotificationBus", () => {
  it("把 publish 的脉冲扇出给同 workspace 的订阅者", async () => {
    const bus = new InMemoryNotificationBus();
    const received: NotificationPulse[] = [];
    await bus.subscribe(WS, (p) => received.push(p));

    await bus.publish(WS, pulse());

    expect(received).toEqual([pulse()]);
  });

  it("不同 workspace 的脉冲互不串扰", async () => {
    const bus = new InMemoryNotificationBus();
    const received: NotificationPulse[] = [];
    await bus.subscribe(WS, (p) => received.push(p));

    await bus.publish("ws-other", pulse());

    expect(received).toHaveLength(0);
  });

  it("取消订阅后不再收到脉冲", async () => {
    const bus = new InMemoryNotificationBus();
    const received: NotificationPulse[] = [];
    const unsubscribe = await bus.subscribe(WS, (p) => received.push(p));

    await unsubscribe();
    await bus.publish(WS, pulse());

    expect(received).toHaveLength(0);
  });

  it("close 清空全部订阅,之后的 publish 不再送达", async () => {
    const bus = new InMemoryNotificationBus();
    const received: NotificationPulse[] = [];
    await bus.subscribe(WS, (p) => received.push(p));

    await bus.close();
    await bus.publish(WS, pulse());

    expect(received).toHaveLength(0);
  });
});

/** ioredis 的最小假实现:探针化 publish/subscribe/unsubscribe,并可手动触发 message。 */
function fakeRedis() {
  let onMessage: ((channel: string, message: string) => void) | null = null;
  return {
    publish: vi.fn(async () => 0),
    subscribe: vi.fn(async () => 0),
    unsubscribe: vi.fn(async () => 0),
    quit: vi.fn(async () => "OK"),
    on(event: string, cb: (channel: string, message: string) => void) {
      if (event === "message") {
        onMessage = cb;
      }
      return this;
    },
    emit(channel: string, message: string) {
      onMessage?.(channel, message);
    },
  };
}

describe("RedisNotificationBus", () => {
  it("publish 把脉冲发到按 workspace 分片的频道", async () => {
    const publisher = fakeRedis();
    const bus = new RedisNotificationBus({
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis 仅实现被用到的方法。
      publisher: publisher as any,
      // biome-ignore lint/suspicious/noExplicitAny: 同上。
      createSubscriber: () => fakeRedis() as any,
    });

    await bus.publish(WS, pulse());

    expect(publisher.publish).toHaveBeenCalledWith(
      notificationChannel(WS),
      JSON.stringify(pulse()),
    );
  });

  it("同一频道多个订阅者只 subscribe 一次,message 扇出给全部", async () => {
    const subscriber = fakeRedis();
    const bus = new RedisNotificationBus({
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      publisher: fakeRedis() as any,
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      createSubscriber: () => subscriber as any,
    });
    const a: NotificationPulse[] = [];
    const b: NotificationPulse[] = [];
    await bus.subscribe(WS, (p) => a.push(p));
    await bus.subscribe(WS, (p) => b.push(p));

    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);

    subscriber.emit(notificationChannel(WS), JSON.stringify(pulse()));
    expect(a).toEqual([pulse()]);
    expect(b).toEqual([pulse()]);
  });

  it("最后一个订阅者取消后才对底层 unsubscribe", async () => {
    const subscriber = fakeRedis();
    const bus = new RedisNotificationBus({
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      publisher: fakeRedis() as any,
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      createSubscriber: () => subscriber as any,
    });
    const off1 = await bus.subscribe(WS, () => {});
    const off2 = await bus.subscribe(WS, () => {});

    await off1();
    expect(subscriber.unsubscribe).not.toHaveBeenCalled();

    await off2();
    expect(subscriber.unsubscribe).toHaveBeenCalledWith(notificationChannel(WS));
  });

  it("脏消息(非法 JSON)被忽略,不影响 handler", async () => {
    const subscriber = fakeRedis();
    const bus = new RedisNotificationBus({
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      publisher: fakeRedis() as any,
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      createSubscriber: () => subscriber as any,
    });
    const received: NotificationPulse[] = [];
    await bus.subscribe(WS, (p) => received.push(p));

    subscriber.emit(notificationChannel(WS), "not-json{");
    expect(received).toHaveLength(0);

    subscriber.emit(notificationChannel(WS), JSON.stringify(pulse()));
    expect(received).toEqual([pulse()]);
  });

  it("没有本地订阅者的频道消息被忽略", async () => {
    const subscriber = fakeRedis();
    const bus = new RedisNotificationBus({
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      publisher: fakeRedis() as any,
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      createSubscriber: () => subscriber as any,
    });
    const received: NotificationPulse[] = [];
    await bus.subscribe(WS, (p) => received.push(p));

    // Redis 层退订是 best-effort:handler 已清但底层频道消息仍可能先到一步。
    subscriber.emit(notificationChannel("ws-other"), JSON.stringify(pulse()));

    expect(received).toHaveLength(0);
  });

  it("重复调用同一取消订阅函数是幂等的,只对底层 unsubscribe 一次", async () => {
    const subscriber = fakeRedis();
    const bus = new RedisNotificationBus({
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      publisher: fakeRedis() as any,
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      createSubscriber: () => subscriber as any,
    });
    const off = await bus.subscribe(WS, () => {});

    await off();
    await off();

    expect(subscriber.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("close 退出底层订阅连接,且未订阅时 close 也安全", async () => {
    const subscriber = fakeRedis();
    const bus = new RedisNotificationBus({
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      publisher: fakeRedis() as any,
      // biome-ignore lint/suspicious/noExplicitAny: 假 Redis。
      createSubscriber: () => subscriber as any,
    });
    await bus.subscribe(WS, () => {});

    await bus.close();
    expect(subscriber.quit).toHaveBeenCalledTimes(1);

    // 订阅连接已置空,再次 close 不应再 quit,也不应抛错。
    await bus.close();
    expect(subscriber.quit).toHaveBeenCalledTimes(1);
  });
});
