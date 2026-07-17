import { describe, expect, it } from "vitest";
import { estimateTokens } from "./tokens";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("counts CJK characters as ~1 token each", () => {
    expect(estimateTokens("身份认证与授权")).toBe(7);
  });

  it("counts latin text by ~4 chars/token", () => {
    // 16 non-space chars → 4 tokens.
    expect(estimateTokens("abcdefghijklmnop")).toBe(4);
  });

  it("ignores extra whitespace in the latin portion", () => {
    expect(estimateTokens("  abcd   efgh  ")).toBe(estimateTokens("abcd efgh"));
  });
});
