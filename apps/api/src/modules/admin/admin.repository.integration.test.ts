import { db, queryClient } from "@doc-pilot/database";
import { aiGenerations, documents, user, workspaces } from "@doc-pilot/database/schema";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOverview, listUsers, listWorkspaces, usageSince } from "./admin.repository";

// 这是租户隔离不变量的「另一面」:scoped repo 的集成测试断言跨 workspace **不可见**,
// 本测试断言 admin repo 跨 workspace **可见**(有意的授权例外,ADR-008 / cross-cutting §25)。
const runId = `admin-it-${Date.now()}`;
const userA = `${runId}-a`;
const userB = `${runId}-b`;
let workspaceA = "";
let workspaceB = "";

beforeAll(async () => {
  await db.insert(user).values([
    { id: userA, name: "AdminITA", email: `${userA}@test.local`, emailVerified: true },
    { id: userB, name: "AdminITB", email: `${userB}@test.local`, emailVerified: true },
  ]);
  const [a, b] = await db
    .insert(workspaces)
    .values([
      { name: "admin-it-a", ownerId: userA },
      { name: "admin-it-b", ownerId: userB },
    ])
    .returning();
  if (!a || !b) {
    throw new Error("集成测试 workspace 创建失败");
  }
  workspaceA = a.id;
  workspaceB = b.id;
  await db.insert(documents).values([
    {
      workspaceId: workspaceA,
      ownerId: userA,
      title: "a-doc",
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: "ready",
    },
    {
      workspaceId: workspaceB,
      ownerId: userB,
      title: "b-doc",
      originalFilename: "b.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: "ready",
    },
  ]);
  // 两个租户各一条 AI 用量记录,不同模型,便于验证跨租户 + 按模型聚合。
  await db.insert(aiGenerations).values([
    {
      workspaceId: workspaceA,
      capability: "answer",
      provider: "test",
      model: `${runId}-modelX`,
      status: "succeeded",
      inputTokens: 100,
      outputTokens: 50,
      costMicros: 700,
      traceId: `${runId}-a`,
    },
    {
      workspaceId: workspaceB,
      capability: "answer",
      provider: "test",
      model: `${runId}-modelY`,
      status: "succeeded",
      inputTokens: 200,
      outputTokens: 20,
      costMicros: 300,
      traceId: `${runId}-b`,
    },
  ]);
});

afterAll(async () => {
  // ai_generations 无外键到 document/user,workspace 级联删不掉它按 workspaceId 清。
  await db
    .delete(aiGenerations)
    .where(inArray(aiGenerations.workspaceId, [workspaceA, workspaceB]));
  await db.delete(user).where(eq(user.id, userA));
  await db.delete(user).where(eq(user.id, userB));
  await queryClient.end();
});

describe("admin repository 跨租户可见(有意的授权例外)", () => {
  it("overview 汇总覆盖多个 workspace 的用户/workspace/文档/用量", async () => {
    const overview = await getOverview();
    // 用 >= 断言:库里可能有其它测试残留数据,只需确认本测试造的数据都被计入。
    expect(overview.userCount).toBeGreaterThanOrEqual(2);
    expect(overview.workspaceCount).toBeGreaterThanOrEqual(2);
    expect(overview.documentCount).toBeGreaterThanOrEqual(2);
    expect(overview.usage.costMicros).toBeGreaterThanOrEqual(1000);
  });

  it("usageSince 的 byModel 同时包含两个租户各自的模型", async () => {
    const since = new Date(Date.now() - 1000 * 60 * 60); // 近一小时
    const { byModel } = await usageSince(since);
    const mine = byModel.filter((m) => m.model.startsWith(runId));
    const models = mine.map((m) => m.model).sort();
    expect(models).toEqual([`${runId}-modelX`, `${runId}-modelY`]);
    const total = mine.reduce((s, m) => s + m.costMicros, 0);
    expect(total).toBe(1000);
  });

  it("listWorkspaces 能列出两个租户,并带 owner 邮箱与文档计数", async () => {
    const rows = await listWorkspaces({ limit: 100, offset: 0 });
    const a = rows.find((r) => r.id === workspaceA);
    const b = rows.find((r) => r.id === workspaceB);
    expect(a?.ownerEmail).toBe(`${userA}@test.local`);
    expect(a?.documentCount).toBe(1);
    expect(b?.documentCount).toBe(1);
  });

  it("listUsers 能列出两个用户,并带所属 workspace 计数", async () => {
    const rows = await listUsers({ limit: 100, offset: 0 });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(userA);
    expect(ids).toContain(userB);
  });
});
