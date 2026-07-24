import { describe, expect, it } from "vitest";
import { DOCUMENT_STATUS } from "./documents";
import {
  NOTIFICATION_HEARTBEAT_MS,
  NOTIFICATION_PAGE,
  NOTIFICATION_SSE_EVENTS,
  NOTIFICATION_TYPE,
  notificationChannel,
} from "./notifications";

describe("notificationChannel", () => {
  it("按 workspace 分片拼频道名(Worker publish 与 API 订阅必须逐字符一致)", () => {
    expect(notificationChannel("ws-1")).toBe("notif:ws:ws-1");
  });

  it("不同 workspace 得到不同频道(租户间脉冲互不可见)", () => {
    expect(notificationChannel("ws-a")).not.toBe(notificationChannel("ws-b"));
  });
});

describe("通知类型", () => {
  it("类型名的后缀对应文档终态枚举(ready / failed 与 DOCUMENT_STATUS 同源)", () => {
    for (const type of Object.values(NOTIFICATION_TYPE)) {
      const [resource, status] = type.split(".");
      expect(resource).toBe("document");
      expect(DOCUMENT_STATUS).toContain(status);
    }
  });
});

describe("SSE 事件与分页", () => {
  it("事件名带 notification. 命名空间且互不重复", () => {
    const values = Object.values(NOTIFICATION_SSE_EVENTS);
    for (const event of values) {
      expect(event.startsWith("notification.")).toBe(true);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  it("服务端单次返回上限不小于默认窗口(否则默认请求就会被截断)", () => {
    expect(NOTIFICATION_PAGE.max).toBeGreaterThanOrEqual(NOTIFICATION_PAGE.size);
    expect(NOTIFICATION_PAGE.size).toBeGreaterThan(0);
  });

  it("心跳间隔短于常见中间层 30 秒空闲掐断阈值", () => {
    expect(NOTIFICATION_HEARTBEAT_MS).toBeGreaterThan(0);
    expect(NOTIFICATION_HEARTBEAT_MS).toBeLessThan(30_000);
  });
});
