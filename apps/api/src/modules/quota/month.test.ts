import { describe, expect, it } from "vitest";
import { monthStartUtc } from "./month";

describe("monthStartUtc", () => {
  it("返回当月 1 号 UTC 零点", () => {
    const start = monthStartUtc(new Date("2026-07-17T09:30:00Z"));
    expect(start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("月初当天仍归属本月", () => {
    const start = monthStartUtc(new Date("2026-01-01T00:00:00Z"));
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("跨年 12 月正确处理", () => {
    const start = monthStartUtc(new Date("2026-12-31T23:59:59Z"));
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});
