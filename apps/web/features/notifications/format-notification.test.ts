import { describe, expect, it } from "vitest";
import { formatRelativeTime, notificationHref } from "./format-notification";

describe("notificationHref", () => {
  it("ready → 该文档的问答页", () => {
    expect(
      notificationHref({ type: "document.ready", resourceType: "document", resourceId: "d1" }),
    ).toBe("/documents/d1/chat");
  });

  it("failed → 文档列表", () => {
    expect(
      notificationHref({ type: "document.failed", resourceType: "document", resourceId: "d1" }),
    ).toBe("/documents");
  });

  it("缺资源 id → 不可点(null)", () => {
    expect(
      notificationHref({ type: "document.ready", resourceType: "document", resourceId: null }),
    ).toBeNull();
  });

  it("非文档资源 → null", () => {
    expect(
      notificationHref({ type: "document.ready", resourceType: "other", resourceId: "x" }),
    ).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-21T12:00:00.000Z").getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("一分钟内 → 刚刚", () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe("刚刚");
  });

  it("分钟级", () => {
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe("5 分钟前");
  });

  it("小时级", () => {
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe("3 小时前");
  });

  it("天级", () => {
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe("2 天前");
  });

  it("非法输入 → 空串", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
