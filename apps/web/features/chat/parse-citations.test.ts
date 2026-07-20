import { describe, expect, it } from "vitest";
import { parseCitationSegments } from "./parse-citations";
import type { CitationItem } from "./types";

function cite(id: string, position: number): CitationItem {
  return {
    id,
    chunkId: `chunk-${id}`,
    quote: "",
    claim: null,
    pageStart: null,
    pageEnd: null,
    score: null,
    position,
  };
}

const citations = [cite("c1", 1), cite("c2", 2)];

describe("parseCitationSegments", () => {
  it("[n] 映射到 citations[n-1],正文切成文本段 + 引用段", () => {
    const segs = parseCitationSegments("结论 A[1] 与结论 B[2]。", citations);
    expect(segs).toEqual([
      { kind: "text", text: "结论 A" },
      { kind: "ref", n: 1, citation: citations[0] },
      { kind: "text", text: " 与结论 B" },
      { kind: "ref", n: 2, citation: citations[1] },
      { kind: "text", text: "。" },
    ]);
  });

  it("越界的 [n] 原样保留为文本段(不整条失败)", () => {
    const segs = parseCitationSegments("看 [3] 与 [1]", citations);
    expect(segs).toEqual([
      { kind: "text", text: "看 " },
      { kind: "text", text: "[3]" },
      { kind: "text", text: " 与 " },
      { kind: "ref", n: 1, citation: citations[0] },
    ]);
  });

  it("无标记的纯文本返回单个文本段", () => {
    expect(parseCitationSegments("没有引用", citations)).toEqual([
      { kind: "text", text: "没有引用" },
    ]);
  });

  it("空正文返回空段列表", () => {
    expect(parseCitationSegments("", citations)).toEqual([]);
  });

  it("引用在开头:不产生前导空文本段", () => {
    const segs = parseCitationSegments("[1] 起手", citations);
    expect(segs).toEqual([
      { kind: "ref", n: 1, citation: citations[0] },
      { kind: "text", text: " 起手" },
    ]);
  });
});
