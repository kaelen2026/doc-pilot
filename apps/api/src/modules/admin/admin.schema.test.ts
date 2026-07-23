import { describe, expect, it } from "vitest";
import { parsePageQuery, parseUsageQuery } from "./admin.schema";

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
