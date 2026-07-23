import { NOTIFICATION_RESOURCE, NOTIFICATION_TYPE } from "@doc-pilot/contracts";
import { db, queryClient } from "@doc-pilot/database";
import { notifications, user, workspaces } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countUnread } from "./document.repository";

// 唯一 runId 隔离本次夹具(见 tdd.md「集成测试自我隔离」)。
const runId = `notif-count-it-${Date.now()}`;
const userA = `${runId}-a`;
const userB = `${runId}-b`;
let workspaceA = "";
let workspaceB = "";

async function seedUser(userId: string): Promise<string> {
  await db.insert(user).values({
    id: userId,
    name: userId,
    email: `${userId}@test.local`,
    emailVerified: true,
  });
  const [ws] = await db.insert(workspaces).values({ name: userId, ownerId: userId }).returning();
  if (!ws) {
    throw new Error("集成测试 workspace 创建失败");
  }
  return ws.id;
}

async function seedNotification(input: {
  workspaceId: string;
  userId: string;
  key: string;
  read: boolean;
}): Promise<void> {
  await db.insert(notifications).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: NOTIFICATION_TYPE.documentReady,
    title: `《${input.key}》已就绪`,
    body: "可以问答了",
    resourceType: NOTIFICATION_RESOURCE.document,
    // resource_id 是 uuid 列;dedupe_key 才是文本键(承接 runId 前缀做隔离)。
    resourceId: crypto.randomUUID(),
    dedupeKey: input.key,
    readAt: input.read ? new Date() : null,
  });
}

beforeAll(async () => {
  workspaceA = await seedUser(userA);
  workspaceB = await seedUser(userB);
  // A 在 workspace A:2 未读 + 1 已读。
  await seedNotification({
    workspaceId: workspaceA,
    userId: userA,
    key: `${runId}-a1`,
    read: false,
  });
  await seedNotification({
    workspaceId: workspaceA,
    userId: userA,
    key: `${runId}-a2`,
    read: false,
  });
  await seedNotification({
    workspaceId: workspaceA,
    userId: userA,
    key: `${runId}-a3`,
    read: true,
  });
  // B 在 workspace B:1 未读(不该算进 A 的计数)。
  await seedNotification({
    workspaceId: workspaceB,
    userId: userB,
    key: `${runId}-b1`,
    read: false,
  });
});

afterAll(async () => {
  for (const id of [userA, userB]) {
    await db.delete(user).where(eq(user.id, id));
  }
  await queryClient.end();
});

describe("countUnread 租户/用户隔离", () => {
  it("只数本 (workspace, user) 的未读:排除已读、排除他人/他 workspace", async () => {
    expect(await countUnread({ workspaceId: workspaceA, userId: userA })).toBe(2);
    expect(await countUnread({ workspaceId: workspaceB, userId: userB })).toBe(1);
  });

  it("跨 workspace 不串:拿 A 的 workspace 查 B 的用户 → 0", async () => {
    expect(await countUnread({ workspaceId: workspaceA, userId: userB })).toBe(0);
  });
});
