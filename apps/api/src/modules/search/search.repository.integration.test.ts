import type { AIGateway, AIMetadata } from "@doc-pilot/ai";
import { db, queryClient } from "@doc-pilot/database";
import { documentChunks, documents, user, workspaces } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scopedSearchRepo } from "./search.repository";

const runId = `search-it-${Date.now()}`;
const userA = `${runId}-a`;
const userB = `${runId}-b`;
let workspaceA = "";
let workspaceB = "";
let docA = "";
let docB = "";

// 单位向量(1024 维,bge-m3),库内 chunk 与查询共用它 → 余弦距离 0、相似度 1。
const unitVector = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));

// 注入的假 Gateway:恒返回 unitVector,避免集成测试依赖真实 embedding 端点。
const fakeGateway = {
  async embed(_input: { capability: string; texts: string[]; metadata: AIMetadata }) {
    return {
      embeddings: [unitVector],
      usage: {
        provider: "fake",
        model: "fake",
        capability: "embedding",
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        embeddingTokens: 0,
        latencyMs: 0,
        costMicros: 0,
      },
    };
  },
} as unknown as AIGateway;

const metadata: AIMetadata = { workspaceId: "" };

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
  const [da, dbo] = await db
    .insert(documents)
    .values([
      {
        workspaceId: workspaceA,
        ownerId: userA,
        title: "tenant-a",
        originalFilename: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        status: "ready",
      },
      {
        workspaceId: workspaceB,
        ownerId: userB,
        title: "tenant-b",
        originalFilename: "b.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        status: "ready",
      },
    ])
    .returning();
  if (!da || !dbo) {
    throw new Error("集成测试文档创建失败");
  }
  docA = da.id;
  docB = dbo.id;
  // 两个租户各一条同向量的 chunk(processing_version 与各自文档当前版本 1 一致)。
  await db.insert(documentChunks).values([
    {
      workspaceId: workspaceA,
      documentId: docA,
      processingVersion: 1,
      chunkIndex: 0,
      content: "alpha content",
      contentHash: `${runId}-a`,
      tokenCount: 2,
      embedding: unitVector,
    },
    {
      workspaceId: workspaceB,
      documentId: docB,
      processingVersion: 1,
      chunkIndex: 0,
      content: "beta content",
      contentHash: `${runId}-b`,
      tokenCount: 2,
      embedding: unitVector,
    },
  ]);
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, userA));
  await db.delete(user).where(eq(user.id, userB));
  await queryClient.end();
});

describe("scopedSearchRepo 租户隔离与版本守卫", () => {
  it("跨 workspace 语义搜索绝不返回其它租户的 chunk", async () => {
    const inA = await scopedSearchRepo(workspaceA).searchChunks({
      gateway: fakeGateway,
      query: "anything",
      metadata,
    });
    const inB = await scopedSearchRepo(workspaceB).searchChunks({
      gateway: fakeGateway,
      query: "anything",
      metadata,
    });
    expect(inA.map((c) => c.documentId)).toContain(docA);
    expect(inA.map((c) => c.documentId)).not.toContain(docB);
    expect(inB.map((c) => c.documentId)).toContain(docB);
    expect(inB.map((c) => c.documentId)).not.toContain(docA);
  });

  it("processing_version 与文档当前版本不匹配的陈旧 chunk 不进候选集", async () => {
    // docA 当前版本为 1;插入一条 version=2 的 chunk(文档版本未跟进)→ 应被 join 条件排除。
    await db.insert(documentChunks).values({
      workspaceId: workspaceA,
      documentId: docA,
      processingVersion: 2,
      chunkIndex: 0,
      content: "stale content",
      contentHash: `${runId}-stale`,
      tokenCount: 2,
      embedding: unitVector,
    });
    const inA = await scopedSearchRepo(workspaceA).searchChunks({
      gateway: fakeGateway,
      query: "anything",
      metadata,
    });
    expect(inA.map((c) => c.content)).not.toContain("stale content");
  });
});
