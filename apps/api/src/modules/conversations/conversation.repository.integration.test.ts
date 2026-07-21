import { db, queryClient } from "@doc-pilot/database";
import { conversations, documents, user, workspaces } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scopedConversationRepo } from "./conversation.repository";

const runId = `repo-it-${Date.now()}`;
const userA = `${runId}-a`;
const userB = `${runId}-b`;
let workspaceA = "";
let workspaceB = "";
let conversationA = "";

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
  const [documentA] = await db
    .insert(documents)
    .values({
      workspaceId: workspaceA,
      ownerId: userA,
      title: "tenant-a",
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: "ready",
    })
    .returning();
  if (!documentA) {
    throw new Error("集成测试文档创建失败");
  }
  const created = await scopedConversationRepo(workspaceA).createConversation({
    documentId: documentA.id,
    userId: userA,
    title: null,
  });
  conversationA = created.id;
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, userA));
  await db.delete(user).where(eq(user.id, userB));
  await queryClient.end();
});

describe("scopedConversationRepo database invariants", () => {
  it("跨 workspace 读写都不能命中资源", async () => {
    expect(
      await scopedConversationRepo(workspaceB).getConversation({ conversationId: conversationA }),
    ).toBeNull();
    const pair = await scopedConversationRepo(workspaceA).insertQuestionPair({
      conversationId: conversationA,
      content: "tenant boundary",
      clientRequestId: crypto.randomUUID(),
    });
    if (!pair) {
      throw new Error("测试消息创建失败");
    }
    await expect(
      scopedConversationRepo(workspaceB).resetAssistantForRetry(pair.assistantMessage.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("并发重复 clientRequestId 只创建一组消息", async () => {
    const repo = scopedConversationRepo(workspaceA);
    const request = {
      conversationId: conversationA,
      content: "same question",
      clientRequestId: crypto.randomUUID(),
    };
    const results = await Promise.all([
      repo.insertQuestionPair(request),
      repo.insertQuestionPair(request),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    const pair = await repo.findQuestionPair({
      conversationId: conversationA,
      clientRequestId: request.clientRequestId,
    });
    expect(pair?.assistantMessage?.parentMessageId).toBe(pair?.userMessage.id);
  });

  it("按租户列举会话不会泄露其它 workspace", async () => {
    const visible = await scopedConversationRepo(workspaceA).listConversations({});
    const hidden = await scopedConversationRepo(workspaceB).listConversations({});
    expect(visible.map((row) => row.id)).toContain(conversationA);
    expect(hidden.map((row) => row.id)).not.toContain(conversationA);
    expect(
      await db.select().from(conversations).where(eq(conversations.id, conversationA)),
    ).toHaveLength(1);
  });
});
