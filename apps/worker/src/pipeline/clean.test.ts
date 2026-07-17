import { describe, expect, it } from "vitest";
import { cleanDocument } from "./clean";
import { PipelineError } from "./errors";
import type { ParsedDocument } from "./types";

function doc(pages: string[]): ParsedDocument {
  return {
    metadata: { pageCount: pages.length },
    pages: pages.map((text, i) => ({ pageNumber: i + 1, text })),
  };
}

describe("cleanDocument", () => {
  it("merges wrapped lines into a paragraph and joins hyphenated breaks", () => {
    const cleaned = cleanDocument(doc(["This is a long sen-\ntence that wraps across\nlines."]));
    expect(cleaned.blocks).toHaveLength(1);
    expect(cleaned.blocks[0]?.text).toBe("This is a long sentence that wraps across lines.");
    expect(cleaned.blocks[0]?.page).toBe(1);
  });

  it("keeps paragraph boundaries (blank line splits blocks)", () => {
    const cleaned = cleanDocument(doc(["First paragraph.\n\nSecond paragraph."]));
    expect(cleaned.blocks.map((b) => b.text)).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("drops running headers/footers repeated across pages", () => {
    const page = (body: string) => `ACME Confidential\n\n${body}\n\n1`;
    const cleaned = cleanDocument(
      doc([page("Alpha content here."), page("Beta content here."), page("Gamma content here.")]),
    );
    const texts = cleaned.blocks.map((b) => b.text);
    expect(texts).not.toContain("ACME Confidential");
    expect(texts).toEqual(["Alpha content here.", "Beta content here.", "Gamma content here."]);
  });

  it("removes page-number-only lines", () => {
    const cleaned = cleanDocument(doc(["Body text.\n\n- 12 -"]));
    expect(cleaned.blocks.map((b) => b.text)).toEqual(["Body text."]);
  });

  it("produces a stable content hash for identical input", () => {
    const a = cleanDocument(doc(["Same content."]));
    const b = cleanDocument(doc(["Same content."]));
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.textLength).toBeGreaterThan(0);
  });

  it("throws non-retryable EMPTY_DOCUMENT when no text is extractable", () => {
    try {
      cleanDocument(doc(["", "   "]));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineError);
      expect((err as PipelineError).retryable).toBe(false);
      expect((err as PipelineError).code).toBe("EMPTY_DOCUMENT");
    }
  });
});
