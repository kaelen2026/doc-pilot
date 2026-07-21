import { db, queryClient } from "@doc-pilot/database";
import { notifications, user, workspaces } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scopedNotificationRepo } from "./notification.repository";

const runId = `notif-it-${Date.now()}`;
const userA = `${runId}-a`;
const userB = `${runId}-b`;
let workspaceA = "";
let workspaceB = "";
let notifA1 = "";

beforeAll(async () => {
  await db.insert(user).values([
    { id: userA, name: "A", email: `${userA}@test.local`, emailVerified: true },
    { id: userB, name: "B", email: `${userB}@test.local`, emailVerified: true },
  ]);
  const [a, b] = await db
    .insert(workspaces)
    .values([
      { name: "A", ownerId: userA },
      { name: "B", ownerId: userB },
    ])
    .returning();
  if (!a || !b) {
    throw new Error("集成测试 workspace 创建失败");
  }
  workspaceA = a.id;
  workspaceB = b.id;

  const inserted = await db
    .insert(notifications)
    .values([
      {
        workspaceId: workspaceA,
        userId: userA,
        type: "document.ready",
        title: "A-1 未读",
        dedupeKey: `${runId}-a1`,
      },
      {
        workspaceId: workspaceA,
        userId: userA,
        type: "document.failed",
        title: "A-2 已读",
        readAt: new Date(),
        dedupeKey: `${runId}-a2`,
      },
      {
        workspaceId: workspaceB,
        userId: userB,
        type: "document.ready",
        title: "B-1 未读",
        dedupeKey: `${runId}-b1`,
      },
    ])
    .returning();
  const first = inserted[0];
  if (!first) {
    throw new Error("集成测试通知创建失败");
  }
  notifA1 = first.id;
});

afterAll(async () => {
  // 删 user 级联清理 workspaces / notifications。
  await db.delete(user).where(eq(user.id, userA));
  await db.delete(user).where(eq(user.id, userB));
  await queryClient.end();
});

describe("scopedNotificationRepo database invariants", () => {
  it("列表与未读计数按租户 + 收件人隔离", async () => {
    const listA = await scopedNotificationRepo(workspaceA).list({ userId: userA, limit: 20 });
    expect(listA.map((r) => r.title).sort()).toEqual(["A-1 未读", "A-2 已读"]);

    // 用对方 workspace 查 userA 的通知 → 什么都看不到。
    const crossWorkspace = await scopedNotificationRepo(workspaceB).list({
      userId: userA,
      limit: 20,
    });
    expect(crossWorkspace).toHaveLength(0);

    expect(await scopedNotificationRepo(workspaceA).countUnread({ userId: userA })).toBe(1);
    expect(await scopedNotificationRepo(workspaceB).countUnread({ userId: userB })).toBe(1);
  });

  it("跨租户标记已读抛 not_found,且不影响对方", async () => {
    await expect(
      scopedNotificationRepo(workspaceB).markRead({ userId: userB, id: notifA1 }),
    ).rejects.toMatchObject({ code: "not_found" });
    // A 的未读数不受影响。
    expect(await scopedNotificationRepo(workspaceA).countUnread({ userId: userA })).toBe(1);
  });

  it("标记全部已读只作用于本租户", async () => {
    const updated = await scopedNotificationRepo(workspaceA).markAllRead({ userId: userA });
    expect(updated).toBe(1); // 只有 A-1 未读。
    expect(await scopedNotificationRepo(workspaceA).countUnread({ userId: userA })).toBe(0);
    // B 的未读不受影响。
    expect(await scopedNotificationRepo(workspaceB).countUnread({ userId: userB })).toBe(1);
  });

  it("dedupe_key 唯一:重复投递同一终态事件不产生重复通知(幂等)", async () => {
    const dupeKey = `${runId}-dupe`;
    const row = {
      workspaceId: workspaceA,
      userId: userA,
      type: "document.ready" as const,
      title: "重放",
      dedupeKey: dupeKey,
    };
    await db.insert(notifications).values(row).onConflictDoNothing({
      target: notifications.dedupeKey,
    });
    await db.insert(notifications).values(row).onConflictDoNothing({
      target: notifications.dedupeKey,
    });

    const rows = await db.select().from(notifications).where(eq(notifications.dedupeKey, dupeKey));
    expect(rows).toHaveLength(1);
  });
});
