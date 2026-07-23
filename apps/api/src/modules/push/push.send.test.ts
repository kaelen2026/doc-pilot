import { describe, expect, it } from "vitest";
import { maskToken, summarizeTestSend } from "./push.send";

describe("maskToken", () => {
  it("只保留末尾 8 位,前缀省略号", () => {
    expect(maskToken("abcdef0123456789")).toBe("…23456789");
  });
  it("短令牌原样返回(不足以脱敏)", () => {
    expect(maskToken("abcd")).toBe("abcd");
  });
});

describe("summarizeTestSend", () => {
  it("统计成功/失败,失效令牌(410/BadDeviceToken)进 invalidTokens,展示令牌脱敏", () => {
    const good = "1".repeat(64);
    const gone = "2".repeat(64);
    const flaky = "3".repeat(64);
    const summary = summarizeTestSend([
      { token: good, response: { status: 200 } },
      { token: gone, response: { status: 410, reason: "Unregistered" } },
      { token: flaky, response: { status: 429, reason: "TooManyRequests" } },
    ]);
    expect(summary.requested).toBe(3);
    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(2);
    // 只有明确失效的令牌被标记清除;429 是临时故障,不清除。
    expect(summary.invalidTokens).toEqual([gone]);
    expect(summary.results).toEqual([
      { token: "…11111111", status: 200 },
      { token: "…22222222", status: 410, reason: "Unregistered" },
      { token: "…33333333", status: 429, reason: "TooManyRequests" },
    ]);
  });

  it("空设备列表:全 0,无失效令牌", () => {
    expect(summarizeTestSend([])).toEqual({
      requested: 0,
      sent: 0,
      failed: 0,
      invalidTokens: [],
      results: [],
    });
  });
});
