import { describe, expect, it } from "vitest";
import { groupResults, type SearchCandidate } from "./search-results";

let seq = 0;
function firstGroup(groups: ReturnType<typeof groupResults>) {
  const group = groups[0];
  if (!group) {
    throw new Error("expected at least one result group");
  }
  return group;
}

function candidate(overrides: Partial<SearchCandidate> = {}): SearchCandidate {
  seq += 1;
  return {
    documentId: "doc-1",
    title: "Doc 1",
    chunkId: `chunk-${seq}`,
    content: `content ${seq}`,
    contentHash: `hash-${seq}`,
    pageStart: 1,
    pageEnd: 1,
    score: 0.9,
    ...overrides,
  };
}

describe("groupResults", () => {
  it("把同一文档的多个命中片段合并到一个结果,片段按分降序", () => {
    const group = firstGroup(
      groupResults(
        [
          candidate({ documentId: "doc-1", chunkId: "c1", score: 0.5 }),
          candidate({ documentId: "doc-1", chunkId: "c2", score: 0.8 }),
        ],
        { minScore: 0 },
      ),
    );
    expect(group.documentId).toBe("doc-1");
    expect(group.passages.map((p) => p.chunkId)).toEqual(["c2", "c1"]);
    // 文档分 = 最高片段分。
    expect(group.score).toBe(0.8);
  });

  it("文档结果按各自最高分降序排列", () => {
    const results = groupResults(
      [
        candidate({ documentId: "low", score: 0.3 }),
        candidate({ documentId: "high", score: 0.95 }),
        candidate({ documentId: "mid", score: 0.6 }),
      ],
      { minScore: 0 },
    );
    expect(results.map((r) => r.documentId)).toEqual(["high", "mid", "low"]);
  });

  it("过滤掉低于 minScore 的候选", () => {
    const results = groupResults(
      [
        candidate({ documentId: "keep", score: 0.7 }),
        candidate({ documentId: "drop", score: 0.1 }),
      ],
      { minScore: 0.5 },
    );
    expect(results.map((r) => r.documentId)).toEqual(["keep"]);
  });

  it("按 contentHash 去重高度重复片段", () => {
    const group = firstGroup(
      groupResults(
        [
          candidate({ documentId: "doc-1", chunkId: "c1", contentHash: "same", score: 0.9 }),
          candidate({ documentId: "doc-1", chunkId: "c2", contentHash: "same", score: 0.8 }),
        ],
        { minScore: 0 },
      ),
    );
    expect(group.passages).toHaveLength(1);
    expect(group.passages[0]?.chunkId).toBe("c1");
  });

  it("每个文档的片段数受 maxPassagesPerDoc 约束", () => {
    const group = firstGroup(
      groupResults(
        [
          candidate({ documentId: "doc-1", score: 0.9 }),
          candidate({ documentId: "doc-1", score: 0.8 }),
          candidate({ documentId: "doc-1", score: 0.7 }),
        ],
        { minScore: 0, maxPassagesPerDoc: 2 },
      ),
    );
    expect(group.passages).toHaveLength(2);
  });

  it("文档结果数受 maxResults 约束(保留高分文档)", () => {
    const results = groupResults(
      [
        candidate({ documentId: "a", score: 0.9 }),
        candidate({ documentId: "b", score: 0.8 }),
        candidate({ documentId: "c", score: 0.7 }),
      ],
      { minScore: 0, maxResults: 2 },
    );
    expect(results.map((r) => r.documentId)).toEqual(["a", "b"]);
  });

  it("空候选返回空数组", () => {
    expect(groupResults([], { minScore: 0 })).toEqual([]);
  });
});
