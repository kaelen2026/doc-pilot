import { db, queryClient } from "@doc-pilot/database";
import { pushDevices, user } from "@doc-pilot/database/schema";
import type { ApnsClient, ApnsResponse } from "@doc-pilot/push";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as repo from "./push.repository";
import { sendTestPushToUser } from "./push.service";

const runId = `push-it-${Date.now()}`;
const userA = `${runId}-a`;
const userB = `${runId}-b`;
const tokenA1 = `a1${runId.replace(/[^0-9a-f]/g, "0")}`.padEnd(64, "0");
const tokenA2 = `a2${runId.replace(/[^0-9a-f]/g, "0")}`.padEnd(64, "1");
const tokenB1 = `b1${runId.replace(/[^0-9a-f]/g, "0")}`.padEnd(64, "2");

beforeAll(async () => {
  await db.insert(user).values([
    { id: userA, name: "A", email: `${userA}@test.local`, emailVerified: true },
    { id: userB, name: "B", email: `${userB}@test.local`, emailVerified: true },
  ]);
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, userA));
  await db.delete(user).where(eq(user.id, userB));
  await queryClient.end();
});

describe("push.repository / service 数据不变量", () => {
  it("upsert 幂等:同一 token 重复注册不产生重复行,且刷新 platform/environment", async () => {
    await repo.upsertDevice({
      userId: userA,
      token: tokenA1,
      platform: "ios",
      environment: "sandbox",
    });
    await repo.upsertDevice({
      userId: userA,
      token: tokenA1,
      platform: "ios",
      environment: "production",
    });
    const rows = await db.select().from(pushDevices).where(eq(pushDevices.token, tokenA1));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.environment).toBe("production");
  });

  it("listByUserId 只返回该用户的设备(用户隔离)", async () => {
    await repo.upsertDevice({
      userId: userA,
      token: tokenA2,
      platform: "ios",
      environment: "sandbox",
    });
    await repo.upsertDevice({
      userId: userB,
      token: tokenB1,
      platform: "ios",
      environment: "sandbox",
    });
    const a = await repo.listByUserId(userA);
    const b = await repo.listByUserId(userB);
    expect(a.map((d) => d.token).sort()).toEqual([tokenA1, tokenA2].sort());
    expect(b.map((d) => d.token)).toEqual([tokenB1]);
  });

  it("deleteByToken 限定用户:B 不能删 A 的令牌", async () => {
    await repo.deleteByToken({ userId: userB, token: tokenA1 });
    expect((await repo.listByUserId(userA)).some((d) => d.token === tokenA1)).toBe(true);
  });

  it("sendTestPushToUser 发到用户全部设备,并清除 APNS 判定失效的令牌", async () => {
    // 假 APNS:tokenA1 成功,tokenA2 返回 410(Unregistered)→ 应被清除。
    const fakeApns: ApnsClient = {
      send: async ({ deviceToken }): Promise<ApnsResponse> =>
        deviceToken === tokenA2 ? { status: 410, reason: "Unregistered" } : { status: 200 },
    };
    const summary = await sendTestPushToUser({
      userId: userA,
      title: "hi",
      body: "body",
      apns: fakeApns,
    });
    expect(summary.requested).toBe(2);
    expect(summary.sent).toBe(1);
    expect(summary.invalidTokens).toEqual([tokenA2]);
    // 失效令牌已从库中删除,有效令牌保留。
    const remaining = (await repo.listByUserId(userA)).map((d) => d.token);
    expect(remaining).toEqual([tokenA1]);
  });
});
