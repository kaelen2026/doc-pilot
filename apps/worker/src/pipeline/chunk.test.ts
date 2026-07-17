import { describe, expect, it } from "vitest";
import { chunkDocument } from "./chunk";
import type { CleanedBlock, CleanedDocument } from "./types";

function cleaned(blocks: CleanedBlock[]): CleanedDocument {
  return {
    metadata: { pageCount: 1 },
    pageCount: 1,
    blocks,
    textLength: blocks.reduce((n, b) => n + b.text.length, 0),
    contentHash: "test",
  };
}

const P = (text: string, page = 1): CleanedBlock => ({ type: "paragraph", text, page });
const H = (text: string, page = 1): CleanedBlock => ({ type: "heading", text, page });

describe("chunkDocument", () => {
  it("emits a single chunk for short content with empty section path", () => {
    const chunks = chunkDocument(cleaned([P("Hello world.")]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks[0]?.sectionPath).toEqual([]);
    expect(chunks[0]?.tokenCount).toBeGreaterThan(0);
    expect(chunks[0]?.metadata).toEqual({ parserVersion: "pdf-v1", chunkerVersion: "semantic-v1" });
  });

  it("attaches the current heading as section path", () => {
    const chunks = chunkDocument(cleaned([H("3.1 身份认证"), P("认证相关正文。")]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sectionPath).toEqual(["3.1 身份认证"]);
  });

  it("nests section path by numbering depth and resets on siblings", () => {
    const nested = chunkDocument(
      cleaned([H("3.1 A"), P("aaa"), H("3.1.1 B"), P("bbb"), H("3.2 C"), P("ccc")]),
    );
    expect(nested.map((c) => c.sectionPath)).toEqual([["3.1 A"], ["3.1 A", "3.1.1 B"], ["3.2 C"]]);
  });

  it("is deterministic: same input yields identical index + content hash (idempotency backbone)", () => {
    const input = cleaned([H("1 Intro"), P("Some content."), H("2 Body"), P("More content.")]);
    const a = chunkDocument(input);
    const b = chunkDocument(input);
    expect(a.map((c) => [c.chunkIndex, c.contentHash])).toEqual(
      b.map((c) => [c.chunkIndex, c.contentHash]),
    );
  });

  it("splits an oversized block into multiple bounded chunks", () => {
    const big = Array.from({ length: 300 }, (_, i) => `This is sentence number ${i}.`).join(" ");
    const chunks = chunkDocument(cleaned([P(big)]));
    expect(chunks.length).toBeGreaterThan(1);
    // 正文按 maxTokens=1000 收敛,叠加 overlap(<=120)后留足冗余。
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(1200);
    }
    // chunkIndex 连续且从 0 开始。
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });
});
