import { describe, expect, it } from "vitest";
import { classifyPollResult } from "./poll";

describe("classifyPollResult", () => {
  it("有 data 且无 error → approved", () => {
    expect(classifyPollResult({ data: { token: "x" }, error: null })).toBe("approved");
  });

  it("authorization_pending → waiting(继续轮询)", () => {
    expect(classifyPollResult({ error: { error: "authorization_pending" } })).toBe("waiting");
  });

  it("slow_down 也视为 waiting", () => {
    expect(classifyPollResult({ error: { error: "slow_down" } })).toBe("waiting");
  });

  it("access_denied → denied(用户在手机拒绝)", () => {
    expect(classifyPollResult({ error: { error: "access_denied" } })).toBe("denied");
  });

  it("expired_token → expired(需重新生成二维码)", () => {
    expect(classifyPollResult({ error: { error: "expired_token" } })).toBe("expired");
  });

  it("错误码落在 code 字段也能识别", () => {
    expect(classifyPollResult({ error: { code: "expired_token" } })).toBe("expired");
  });

  it("错误码落在 message 字段也能识别", () => {
    expect(classifyPollResult({ error: { message: "access_denied" } })).toBe("denied");
  });

  it("未知错误 / 网络错误 → error", () => {
    expect(classifyPollResult({ error: { status: 500, message: "boom" } })).toBe("error");
    expect(classifyPollResult({})).toBe("error");
  });
});
