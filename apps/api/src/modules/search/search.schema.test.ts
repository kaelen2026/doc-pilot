import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "./search.schema";

describe("parseSearchQuery", () => {
  it("trim 后返回查询词", () => {
    expect(parseSearchQuery("  向量检索  ")).toEqual({ query: "向量检索" });
  });

  it("非字符串抛 validation_error", () => {
    expect(() => parseSearchQuery(undefined)).toThrowError(
      expect.objectContaining({ code: "validation_error" }),
    );
  });

  it("trim 后过短抛 validation_error", () => {
    expect(() => parseSearchQuery(" a ")).toThrowError(
      expect.objectContaining({ code: "validation_error" }),
    );
  });
});
