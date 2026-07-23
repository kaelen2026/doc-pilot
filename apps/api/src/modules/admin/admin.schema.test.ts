import { describe, expect, it } from "vitest";
import { parsePageQuery, parseTestPush, parseUsageQuery } from "./admin.schema";

describe("parseUsageQuery", () => {
  it("缺省 days 回退 30", () => {
    expect(parseUsageQuery({})).toEqual({ days: 30 });
  });

  it("接受合法 days", () => {
    expect(parseUsageQuery({ days: "7" })).toEqual({ days: 7 });
  });

  it.each(["0", "366", "1.5", "abc", "-3"])("非法 days=%s 抛 validation_error", (days) => {
    expect(() => parseUsageQuery({ days })).toThrow(
      expect.objectContaining({ code: "validation_error" }),
    );
  });
});

describe("parsePageQuery", () => {
  it("缺省回退 limit=50 offset=0", () => {
    expect(parsePageQuery({})).toEqual({ limit: 50, offset: 0 });
  });

  it("接受合法分页", () => {
    expect(parsePageQuery({ limit: "20", offset: "40" })).toEqual({ limit: 20, offset: 40 });
  });

  it.each(["0", "101", "2.5", "x"])("非法 limit=%s 抛 validation_error", (limit) => {
    expect(() => parsePageQuery({ limit })).toThrow(
      expect.objectContaining({ code: "validation_error" }),
    );
  });

  it("负数 offset 抛 validation_error", () => {
    expect(() => parsePageQuery({ offset: "-1" })).toThrow(
      expect.objectContaining({ code: "validation_error" }),
    );
  });
});

describe("parseTestPush", () => {
  it("缺省 title/body 用默认文案,email 去空白", () => {
    const out = parseTestPush({ email: "  a@b.com " });
    expect(out.email).toBe("a@b.com");
    expect(out.title).toBeTruthy();
    expect(out.body).toBeTruthy();
  });

  it("接受自定义 title/body 并去空白", () => {
    expect(parseTestPush({ email: "a@b.com", title: " 你好 ", body: " 世界 " })).toEqual({
      email: "a@b.com",
      title: "你好",
      body: "世界",
    });
  });

  it.each([undefined, "", "no-at-sign", 123])("非法 email=%s 抛 validation_error", (email) => {
    expect(() => parseTestPush({ email })).toThrow(
      expect.objectContaining({ code: "validation_error" }),
    );
  });

  it("超长 title 抛 validation_error", () => {
    expect(() => parseTestPush({ email: "a@b.com", title: "x".repeat(200) })).toThrow(
      expect.objectContaining({ code: "validation_error" }),
    );
  });

  it("非对象请求体抛 validation_error", () => {
    expect(() => parseTestPush(null)).toThrow(
      expect.objectContaining({ code: "validation_error" }),
    );
  });
});
