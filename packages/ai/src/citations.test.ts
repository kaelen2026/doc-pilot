import { describe, expect, it } from "vitest";
import {
  type Answer,
  AnswerSchema,
  type CitationSource,
  quoteMatchScore,
  validateAnswer,
} from "./citations";

const DOC = "doc_a";

const sources: CitationSource[] = [
  {
    sourceId: "src_1",
    documentId: DOC,
    chunkId: "chunk_20",
    text: "系统选择服务端 Session 而非 JWT，主要原因是需要支持即时撤销：用户登出或被管理员禁用后，会话必须立刻失效，而无状态 JWT 在过期前无法撤回。",
    pageStart: 12,
    pageEnd: 12,
  },
  {
    sourceId: "src_2",
    documentId: DOC,
    chunkId: "chunk_21",
    text: "Session 存储选用 Redis，读取路径为 cookie 中的 session id 到 Redis 哈希，平均延迟低于 1 毫秒。",
    pageStart: 13,
  },
  {
    sourceId: "src_other",
    documentId: "doc_b",
    chunkId: "chunk_99",
    text: "另一份文档里关于计费的内容。",
  },
];

function answer(overrides: Partial<Answer> = {}): Answer {
  return AnswerSchema.parse({
    answer: "文档选择服务端 Session 的原因是需要支持即时撤销。",
    citations: [
      {
        sourceId: "src_1",
        quote: "需要支持即时撤销：用户登出或被管理员禁用后，会话必须立刻失效",
        claim: "选择服务端 Session 是为了即时撤销",
      },
    ],
    insufficientEvidence: false,
    ...overrides,
  });
}

describe("validateAnswer", () => {
  it("合法引用通过，补齐落库字段（chunkId / 页码 / matchScore）", () => {
    const result = validateAnswer(answer(), { sources, documentId: DOC });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      sourceId: "src_1",
      chunkId: "chunk_20",
      documentId: DOC,
      pageStart: 12,
      matchScore: 1,
    });
  });

  it("sourceId 不在本次上下文 → UNKNOWN_SOURCE", () => {
    const result = validateAnswer(
      answer({
        citations: [{ sourceId: "src_ghost", quote: "任意", claim: "任意" }],
      }),
      { sources, documentId: DOC },
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "UNKNOWN_SOURCE", index: 0, sourceId: "src_ghost" }),
    ]);
  });

  it("引用其他文档的 source → WRONG_DOCUMENT（跨文档无法引用）", () => {
    const result = validateAnswer(
      answer({
        citations: [{ sourceId: "src_other", quote: "另一份文档里关于计费的内容。", claim: "x" }],
      }),
      { sources, documentId: DOC },
    );

    expect(result.issues).toEqual([
      expect.objectContaining({ code: "WRONG_DOCUMENT", index: 0, sourceId: "src_other" }),
    ]);
  });

  it("quote 与原文对不上 → QUOTE_MISMATCH", () => {
    const result = validateAnswer(
      answer({
        citations: [{ sourceId: "src_2", quote: "系统采用 PostgreSQL 存储会话数据", claim: "x" }],
      }),
      { sources, documentId: DOC },
    );

    expect(result.issues).toEqual([
      expect.objectContaining({ code: "QUOTE_MISMATCH", index: 0, sourceId: "src_2" }),
    ]);
  });

  it("quote 容忍标点/空白差异与少量省略", () => {
    const result = validateAnswer(
      answer({
        citations: [
          {
            sourceId: "src_2",
            // 原文是中文标点 + 无空格；这里用英文逗号、加空格、结尾省略
            quote: "Session 存储选用 Redis, 读取路径为 cookie 中的 session id 到 Redis 哈希",
            claim: "Session 存 Redis",
          },
        ],
      }),
      { sources, documentId: DOC },
    );

    expect(result.ok).toBe(true);
    expect(result.citations[0]?.matchScore).toBeGreaterThanOrEqual(0.8);
  });

  it("证据充分但零引用 → MISSING_CITATIONS；拒答却带引用 → UNEXPECTED_CITATIONS", () => {
    const missing = validateAnswer(answer({ citations: [] }), { sources, documentId: DOC });
    expect(missing.issues).toEqual([
      expect.objectContaining({ code: "MISSING_CITATIONS", index: -1 }),
    ]);

    const refusalWithCitations = validateAnswer(answer({ insufficientEvidence: true }), {
      sources,
      documentId: DOC,
    });
    expect(refusalWithCitations.issues).toEqual([
      expect.objectContaining({ code: "UNEXPECTED_CITATIONS", index: -1 }),
    ]);
  });

  it("拒答且零引用是合法形态（无证据问题拒答）", () => {
    const result = validateAnswer(
      answer({
        answer: "文档中没有关于这个问题的内容。",
        citations: [],
        insufficientEvidence: true,
      }),
      { sources, documentId: DOC },
    );

    expect(result.ok).toBe(true);
    expect(result.citations).toEqual([]);
  });

  it("一条失败不影响其他引用的校验结果", () => {
    const result = validateAnswer(
      answer({
        citations: [
          {
            sourceId: "src_1",
            quote: "需要支持即时撤销：用户登出或被管理员禁用后，会话必须立刻失效",
            claim: "即时撤销",
          },
          { sourceId: "src_ghost", quote: "任意", claim: "任意" },
        ],
      }),
      { sources, documentId: DOC },
    );

    expect(result.ok).toBe(false);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.index).toBe(0);
    expect(result.issues).toEqual([expect.objectContaining({ code: "UNKNOWN_SOURCE", index: 1 })]);
  });
});

describe("quoteMatchScore", () => {
  it("完全子串 = 1，空 quote = 0", () => {
    expect(quoteMatchScore("即时撤销", "需要支持即时撤销的场景")).toBe(1);
    expect(quoteMatchScore("", "任意原文")).toBe(0);
    expect(quoteMatchScore("   ", "任意原文")).toBe(0);
  });

  it("轻微改写仍高于阈值，完全无关低于阈值", () => {
    const source = "上传的 PDF 会被解析为结构化文本，再按语义边界切分为 chunk。";
    expect(quoteMatchScore("PDF 会被解析为结构化文本，再按语义边界切分", source)).toBeGreaterThan(
      0.8,
    );
    expect(quoteMatchScore("向量检索使用 pgvector 的 HNSW 索引", source)).toBeLessThan(0.5);
  });
});
