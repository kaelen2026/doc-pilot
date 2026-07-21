import { NOTIFICATION_PAGE } from "@doc-pilot/contracts";
import { describe, expect, it } from "vitest";
import type { NotificationRow } from "./notification.repository";
import { parseLimit, serializeNotification } from "./notification.schema";

describe("parseLimit", () => {
  it("缺省/非法回落默认窗口", () => {
    expect(parseLimit(undefined)).toBe(NOTIFICATION_PAGE.size);
    expect(parseLimit("abc")).toBe(NOTIFICATION_PAGE.size);
    expect(parseLimit("0")).toBe(NOTIFICATION_PAGE.size);
    expect(parseLimit("-3")).toBe(NOTIFICATION_PAGE.size);
    expect(parseLimit("2.5")).toBe(NOTIFICATION_PAGE.size);
  });

  it("超上限截断到 max", () => {
    expect(parseLimit(String(NOTIFICATION_PAGE.max + 100))).toBe(NOTIFICATION_PAGE.max);
  });

  it("合法值原样返回", () => {
    expect(parseLimit("5")).toBe(5);
  });
});

describe("serializeNotification", () => {
  const base: NotificationRow = {
    id: "n1",
    workspaceId: "w1",
    userId: "u1",
    type: "document.ready",
    title: "文档已就绪",
    body: "可以开始问答了",
    resourceType: "document",
    resourceId: "d1",
    metadata: { errorCode: "X" },
    dedupeKey: "document:d1:v1:ready",
    readAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("read 由 read_at 派生;不外泄租户内部字段", () => {
    const dto = serializeNotification(base);
    expect(dto.read).toBe(false);
    // 不泄露 workspaceId / userId / dedupeKey(与 health 路由「不泄漏内部」同口径)。
    expect(dto).not.toHaveProperty("workspaceId");
    expect(dto).not.toHaveProperty("userId");
    expect(dto).not.toHaveProperty("dedupeKey");
    expect(dto).not.toHaveProperty("readAt");
  });

  it("read_at 非空 → read = true", () => {
    expect(serializeNotification({ ...base, readAt: new Date() }).read).toBe(true);
  });
});
