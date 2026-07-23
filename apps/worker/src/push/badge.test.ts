import type { ApnsClient, PushTarget } from "@doc-pilot/push";
import { describe, expect, it, vi } from "vitest";
import { type BadgePushDeps, sendBadgePush } from "./badge";

function deps(overrides: Partial<BadgePushDeps> = {}): {
  deps: BadgePushDeps;
  send: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn<ApnsClient["send"]>(async () => ({ status: 200 }));
  const del = vi.fn(async () => {});
  return {
    send,
    del,
    deps: {
      client: { send },
      listDevices: async (): Promise<PushTarget[]> => [
        { token: "a", environment: "production" },
        { token: "b", environment: "sandbox" },
      ],
      countUnread: async () => 4,
      deleteInvalidTokens: del,
      ...overrides,
    },
  };
}

describe("sendBadgePush", () => {
  it("以收件人未读数为 badge 发给其每台设备", async () => {
    const { deps: d, send } = deps();
    await sendBadgePush(d, {
      workspaceId: "w1",
      userId: "u1",
      title: "《x》已就绪",
      body: "可以问答了",
    });

    expect(send).toHaveBeenCalledTimes(2);
    const payload = send.mock.calls[0]?.[0]?.payload;
    expect(payload?.aps.badge).toBe(4);
    expect(payload?.aps.alert?.title).toBe("《x》已就绪");
  });

  it("收件人未读数按 (workspaceId, userId) 计", async () => {
    const countUnread = vi.fn(async () => 2);
    const { deps: d, send } = deps({ countUnread });
    await sendBadgePush(d, { workspaceId: "w1", userId: "u1", title: "t", body: "b" });

    expect(countUnread).toHaveBeenCalledWith({ workspaceId: "w1", userId: "u1" });
    expect(send.mock.calls[0]?.[0]?.payload.aps.badge).toBe(2);
  });

  it("失效令牌顺带清除", async () => {
    const send = vi.fn<ApnsClient["send"]>(async (req) =>
      req.deviceToken === "a" ? { status: 410 } : { status: 200 },
    );
    const { deps: d, del } = deps({ client: { send } });
    await sendBadgePush(d, { workspaceId: "w1", userId: "u1", title: "t", body: "b" });

    expect(del).toHaveBeenCalledWith(["a"]);
  });

  it("收件人无设备:不发、不查未读、不删", async () => {
    const countUnread = vi.fn(async () => 0);
    const { deps: d, send, del } = deps({ listDevices: async () => [], countUnread });
    await sendBadgePush(d, { workspaceId: "w1", userId: "u1", title: "t", body: "b" });

    expect(send).not.toHaveBeenCalled();
    expect(countUnread).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
