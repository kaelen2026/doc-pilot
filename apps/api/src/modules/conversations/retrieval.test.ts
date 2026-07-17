import { describe, expect, it } from "vitest";
import { type ChunkCandidate, selectSources, toCitationSources } from "./retrieval";

function candidate(overrides: Partial<ChunkCandidate>): ChunkCandidate {
  return {
    chunkId: `chunk-${overrides.chunkIndex ?? 0}`,
    chunkIndex: 0,
    content: "内容",
    contentHash: `hash-${overrides.chunkIndex ?? 0}`,
    tokenCount: 100,
    pageStart: 1,
    pageEnd: 1,
    score: 0.9,
    ...overrides,
  };
}

describe("selectSources", () => {
  it("按分数取 top,再按 chunkIndex 正序编号 sourceId", () => {
    const sources = selectSources(
      [
        candidate({ chunkIndex: 5, score: 0.9 }),
        candidate({ chunkIndex: 1, score: 0.8 }),
        candidate({ chunkIndex: 3, score: 0.95 }),
      ],
      { maxSources: 3, tokenBudget: 6000, minScore: 0 },
    );
    expect(sources.map((s) => s.chunkIndex)).toEqual([1, 3, 5]);
    expect(sources.map((s) => s.sourceId)).toEqual(["S1", "S2", "S3"]);
  });

  it("尊重 maxSources 与相似度下限", () => {
    const sources = selectSources(
      [
        candidate({ chunkIndex: 1, score: 0.9 }),
        candidate({ chunkIndex: 2, score: 0.85 }),
        candidate({ chunkIndex: 3, score: 0.2 }),
      ],
      { maxSources: 2, tokenBudget: 6000, minScore: 0.5 },
    );
    expect(sources).toHaveLength(2);
    expect(sources.every((s) => s.score >= 0.5)).toBe(true);
  });

  it("同 contentHash 去重,保留高分那个", () => {
    const sources = selectSources(
      [
        candidate({ chunkIndex: 1, score: 0.9, contentHash: "dup" }),
        candidate({ chunkIndex: 2, score: 0.7, contentHash: "dup" }),
      ],
      { maxSources: 8, tokenBudget: 6000, minScore: 0 },
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]?.chunkIndex).toBe(1);
  });

  it("Token 预算约束:超预算的候选被跳过,但继续尝试更小的", () => {
    const sources = selectSources(
      [
        candidate({ chunkIndex: 1, score: 0.9, tokenCount: 5000 }),
        candidate({ chunkIndex: 2, score: 0.8, tokenCount: 5000 }),
        candidate({ chunkIndex: 3, score: 0.7, tokenCount: 800 }),
      ],
      { maxSources: 8, tokenBudget: 6000, minScore: 0 },
    );
    expect(sources.map((s) => s.chunkIndex)).toEqual([1, 3]);
  });
});

describe("toCitationSources", () => {
  it("映射为引用校验的比对基准,null 页码转 undefined", () => {
    const [source] = toCitationSources(
      selectSources([candidate({ chunkIndex: 1, pageStart: null, pageEnd: null })], {
        minScore: 0,
      }),
      "doc-1",
    );
    expect(source).toEqual({
      sourceId: "S1",
      documentId: "doc-1",
      chunkId: "chunk-1",
      text: "内容",
      pageStart: undefined,
      pageEnd: undefined,
    });
  });
});
