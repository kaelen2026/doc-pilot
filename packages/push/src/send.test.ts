import { describe, expect, it, vi } from "vitest";
import type { ApnsClient } from "./client";
import { buildAlertPayload } from "./payload";
import { sendToDevices } from "./send";
import type { ApnsResponse } from "./types";

/** 按设备令牌编排响应的假 client:记录每次 send 的入参,按 token 返回预置响应。 */
function fakeClient(byToken: Record<string, ApnsResponse>) {
  const send = vi.fn<ApnsClient["send"]>(
    async (req) => byToken[req.deviceToken] ?? { status: 200 },
  );
  return { client: { send } satisfies ApnsClient, send };
}

const payload = buildAlertPayload({ title: "hi", badge: 3 });

describe("sendToDevices", () => {
  it("逐台按各自 environment 发送同一 payload,返回每台结果", async () => {
    const { client, send } = fakeClient({
      a: { status: 200, apnsId: "1" },
      b: { status: 200, apnsId: "2" },
    });
    const res = await sendToDevices({
      client,
      devices: [
        { token: "a", environment: "production" },
        { token: "b", environment: "sandbox" },
      ],
      payload,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      deviceToken: "a",
      environment: "production",
      payload,
    });
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      deviceToken: "b",
      environment: "sandbox",
      payload,
    });
    expect(res.outcomes).toEqual([
      { token: "a", response: { status: 200, apnsId: "1" } },
      { token: "b", response: { status: 200, apnsId: "2" } },
    ]);
    expect(res.invalidTokens).toEqual([]);
  });

  it("挑出应清除的失效令牌(410 / BadDeviceToken),临时错误不算", async () => {
    const { client } = fakeClient({
      gone: { status: 410 },
      bad: { status: 400, reason: "BadDeviceToken" },
      busy: { status: 429, reason: "TooManyRequests" },
      ok: { status: 200 },
    });
    const res = await sendToDevices({
      client,
      devices: [
        { token: "gone", environment: "production" },
        { token: "bad", environment: "production" },
        { token: "busy", environment: "production" },
        { token: "ok", environment: "production" },
      ],
      payload,
    });
    expect(res.invalidTokens).toEqual(["gone", "bad"]);
  });

  it("空设备列表:不触碰 client,返回空结果", async () => {
    const { client, send } = fakeClient({});
    const res = await sendToDevices({ client, devices: [], payload });
    expect(send).not.toHaveBeenCalled();
    expect(res).toEqual({ outcomes: [], invalidTokens: [] });
  });
});
