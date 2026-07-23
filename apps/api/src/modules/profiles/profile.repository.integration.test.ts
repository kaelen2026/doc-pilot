import { db, queryClient } from "@doc-pilot/database";
import { documents, user, userFollows, userProfiles, workspaces } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findPublicProfile,
  followByUsername,
  listPublicProfileDocuments,
  unfollowByUsername,
} from "./profile.repository";

const runId = `profile-it-${Date.now()}`;
const userA = `${runId}-a`;
const userB = `${runId}-b`;
const usernameA = `dp_${runId.slice(-8).replaceAll(/[^a-z0-9]/g, "0")}`;
const usernameB = `dp_b${runId.slice(-7).replaceAll(/[^a-z0-9]/g, "0")}`;

beforeAll(async () => {
  await db.insert(user).values([
    { id: userA, name: "A", email: `${userA}@test.local`, emailVerified: true },
    { id: userB, name: "B", email: `${userB}@test.local`, emailVerified: true },
  ]);
  const [workspace] = await db.insert(workspaces).values({ name: "A", ownerId: userA }).returning();
  if (!workspace) throw new Error("workspace setup failed");
  await db.insert(userProfiles).values([
    { userId: userA, username: usernameA },
    { userId: userB, username: usernameB },
  ]);
  await db.insert(documents).values([
    {
      workspaceId: workspace.id,
      ownerId: userA,
      title: "公开",
      originalFilename: "public.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: "ready",
      visibility: "public",
    },
    {
      workspaceId: workspace.id,
      ownerId: userA,
      title: "私有",
      originalFilename: "private.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: "ready",
      visibility: "private",
    },
    {
      workspaceId: workspace.id,
      ownerId: userA,
      title: "处理中",
      originalFilename: "processing.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: "processing",
      visibility: "public",
    },
  ]);
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, userA));
  await db.delete(user).where(eq(user.id, userB));
  await queryClient.end();
});

describe("公开主页仓库不变量", () => {
  it("只列出公开且可阅读的文档", async () => {
    const rows = await listPublicProfileDocuments(usernameA);
    expect(rows.map((row) => row.title)).toEqual(["公开"]);
  });

  it("关注与取消关注幂等且计数准确", async () => {
    await followByUsername(userB, usernameA);
    await followByUsername(userB, usernameA);
    expect(await db.select().from(userFollows).where(eq(userFollows.followerId, userB))).toEqual([
      expect.objectContaining({ followerId: userB, followingId: userA }),
    ]);
    expect((await findPublicProfile(usernameA))?.followerCount).toBe(1);
    await unfollowByUsername(userB, usernameA);
    await unfollowByUsername(userB, usernameA);
    expect((await findPublicProfile(usernameA))?.followerCount).toBe(0);
  });

  it("拒绝自己关注自己", async () => {
    expect(await followByUsername(userA, usernameA)).toBe("self");
  });
});
