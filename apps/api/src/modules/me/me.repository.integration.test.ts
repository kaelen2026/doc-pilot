import { db, queryClient } from "@doc-pilot/database";
import { user } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearDeletionScheduled,
  getDeletionScheduledAt,
  markDeletionScheduled,
} from "./me.repository";

const runId = `me-it-${Date.now()}`;
const userId = `${runId}-u`;

beforeAll(async () => {
  await db.insert(user).values({
    id: userId,
    name: "U",
    email: `${userId}@test.local`,
    emailVerified: true,
  });
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, userId));
  await queryClient.end();
});

describe("me.repository 注销冷静期状态", () => {
  it("初始未请求注销:getDeletionScheduledAt 为 null", async () => {
    expect(await getDeletionScheduledAt(userId)).toBeNull();
  });

  it("markDeletionScheduled:首次写入返回 true 并落库", async () => {
    const at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(await markDeletionScheduled(userId, at)).toBe(true);
    const stored = await getDeletionScheduledAt(userId);
    expect(stored?.getTime()).toBe(at.getTime());
  });

  it("已在冷静期再次 mark:返回 false 且不重置倒计时(幂等)", async () => {
    const first = await getDeletionScheduledAt(userId);
    const later = new Date(Date.now() + 999 * 24 * 60 * 60 * 1000);
    expect(await markDeletionScheduled(userId, later)).toBe(false);
    const stored = await getDeletionScheduledAt(userId);
    expect(stored?.getTime()).toBe(first?.getTime()); // 仍是首次的到期时刻
  });

  it("clearDeletionScheduled:撤销后回到 null", async () => {
    await clearDeletionScheduled(userId);
    expect(await getDeletionScheduledAt(userId)).toBeNull();
  });
});
