import { describe, expect, it, vi } from "vitest";
import { createApnsClient, isUnregisteredToken } from "./client";
import { buildAlertPayload } from "./payload";
import type { ApnsResponse, ApnsSender } from "./types";

/** 记录调用参数、返回可编排响应的假 sender。 */
function fakeSender(response: { status: number; body?: string; headers?: Record<string, string> }) {
  const post = vi.fn<ApnsSender["post"]>(async () => ({
    status: response.status,
    body: response.body ?? "",
    headers: response.headers ?? {},
  }));
  return { sender: { post } satisfies ApnsSender, post };
}

const tokenSource = { token: () => "JWT-TOKEN" };

function client(sender: ApnsSender) {
  return createApnsClient({ tokenSource, sender, bundleId: "dev.w3ctech.docpilot" });
}

describe("createApnsClient.send", () => {
  it("生产环境命中 api.push.apple.com,路径为 /3/device/{token},头含 bearer/topic/push-type", async () => {
    const { sender, post } = fakeSender({ status: 200, headers: { "apns-id": "abc" } });
    const res = await client(sender).send({
      deviceToken: "DEADBEEF",
      environment: "production",
      payload: buildAlertPayload({ title: "hi" }),
    });
    expect(res).toEqual<ApnsResponse>({ status: 200, apnsId: "abc" });
    const arg = post.mock.calls[0]?.[0];
    if (!arg) {
      throw new Error("sender.post 未被调用");
    }
    expect(arg.host).toBe("api.push.apple.com");
    expect(arg.path).toBe("/3/device/DEADBEEF");
    expect(arg.headers.authorization).toBe("bearer JWT-TOKEN");
    expect(arg.headers["apns-topic"]).toBe("dev.w3ctech.docpilot");
    expect(arg.headers["apns-push-type"]).toBe("alert");
  });

  it("sandbox 环境命中 api.sandbox.push.apple.com", async () => {
    const { sender, post } = fakeSender({ status: 200 });
    await client(sender).send({
      deviceToken: "t",
      environment: "sandbox",
      payload: buildAlertPayload({ title: "hi" }),
    });
    expect(post.mock.calls[0]?.[0]?.host).toBe("api.sandbox.push.apple.com");
  });

  it("非 2xx 时从 body 抽出 reason", async () => {
    const { sender } = fakeSender({
      status: 400,
      body: JSON.stringify({ reason: "BadDeviceToken" }),
    });
    const res = await client(sender).send({
      deviceToken: "t",
      environment: "sandbox",
      payload: buildAlertPayload({ title: "hi" }),
    });
    expect(res.status).toBe(400);
    expect(res.reason).toBe("BadDeviceToken");
  });
});

describe("isUnregisteredToken", () => {
  it("410 / BadDeviceToken / Unregistered / DeviceTokenNotForTopic 视为应清除的失效令牌", () => {
    expect(isUnregisteredToken({ status: 410 })).toBe(true);
    expect(isUnregisteredToken({ status: 400, reason: "BadDeviceToken" })).toBe(true);
    expect(isUnregisteredToken({ status: 410, reason: "Unregistered" })).toBe(true);
    expect(isUnregisteredToken({ status: 400, reason: "DeviceTokenNotForTopic" })).toBe(true);
  });

  it("200 或其它临时性错误(如 429/500)不视为失效令牌", () => {
    expect(isUnregisteredToken({ status: 200 })).toBe(false);
    expect(isUnregisteredToken({ status: 429, reason: "TooManyRequests" })).toBe(false);
    expect(isUnregisteredToken({ status: 503, reason: "ServiceUnavailable" })).toBe(false);
  });
});
