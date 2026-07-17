import type { AIGateway } from "@doc-pilot/ai";
import { describe, expect, it, vi } from "vitest";
import { groupBySections, summarizeDocument } from "./summarize";
import type { Chunk } from "./types";

function chunk(overrides: Partial<Chunk>): Chunk {
  return {
    chunkIndex: 0,
    content: "内容",
    contentHash: "hash",
    tokenCount: 100,
    pageStart: 1,
    pageEnd: 1,
    sectionPath: [],
    metadata: { parserVersion: "1", chunkerVersion: "1" },
    ...overrides,
  };
}

const finalSummary = {
  overview: "整体概述",
  keyPoints: ["要点一"],
  topics: ["主题一"],
  questionsWorthAsking: ["问题一"],
};

function fakeGateway() {
  const generateObject = vi.fn(
    async (input: { promptId: string; variables: Record<string, unknown> }) => {
      if (input.promptId === "document-summary-section") {
        return {
          data: {
            section: String(input.variables.section),
            summary: `${input.variables.section} 的概述`,
            keyPoints: ["局部要点"],
          },
          usage: {} as never,
        };
      }
      return { data: finalSummary, usage: {} as never };
    },
  );
  return { gateway: { generateObject } as unknown as AIGateway, generateObject };
}

const metadata = { workspaceId: "ws_1", documentId: "doc_1", traceId: "job_1" };

describe("summarizeDocument", () => {
  it("小文档:全文一次生成最终摘要(mode=fulltext)", async () => {
    const { gateway, generateObject } = fakeGateway();
    const chunks = [
      chunk({ chunkIndex: 0, content: "第一段", tokenCount: 500 }),
      chunk({ chunkIndex: 1, content: "第二段", tokenCount: 500 }),
    ];

    const summary = await summarizeDocument({
      gateway,
      chunks,
      metadata,
      smallDocTokenThreshold: 2000,
    });

    expect(summary).toEqual(finalSummary);
    expect(generateObject).toHaveBeenCalledTimes(1);
    const call = generateObject.mock.calls[0]?.[0];
    expect(call).toMatchObject({ promptId: "document-summary", capability: "summarize" });
    expect(call?.variables).toMatchObject({ mode: "fulltext" });
    expect(String(call?.variables.content)).toContain("第一段");
    expect(String(call?.variables.content)).toContain("第二段");
  });

  it("大文档:按章节 Map 局部摘要再 Reduce 合并(mode=sections)", async () => {
    const { gateway, generateObject } = fakeGateway();
    const chunks = [
      chunk({ chunkIndex: 0, sectionPath: ["1 引言"], tokenCount: 3000 }),
      chunk({ chunkIndex: 1, sectionPath: ["1 引言"], tokenCount: 2000 }),
      chunk({ chunkIndex: 2, sectionPath: ["2 方法"], tokenCount: 4000 }),
    ];

    const summary = await summarizeDocument({
      gateway,
      chunks,
      metadata,
      smallDocTokenThreshold: 1000,
      sectionTokenBudget: 6000,
    });

    expect(summary).toEqual(finalSummary);
    // 两个章节组 + 一次 Reduce
    expect(generateObject).toHaveBeenCalledTimes(3);
    const sectionCalls = generateObject.mock.calls.filter(
      (c) => c[0]?.promptId === "document-summary-section",
    );
    expect(sectionCalls.map((c) => c[0]?.variables.section)).toEqual(["1 引言", "2 方法"]);

    const reduceCall = generateObject.mock.calls.at(-1)?.[0];
    expect(reduceCall?.promptId).toBe("document-summary");
    expect(reduceCall?.variables.mode).toBe("sections");
    expect(String(reduceCall?.variables.content)).toContain("1 引言 的概述");
  });
});

describe("groupBySections", () => {
  it("按 sectionPath 首段聚组,无章节的落入正文组", () => {
    const groups = groupBySections(
      [
        chunk({ sectionPath: ["A"], content: "a1" }),
        chunk({ sectionPath: ["A"], content: "a2" }),
        chunk({ sectionPath: [], content: "x" }),
      ],
      10_000,
    );

    expect(groups.map((g) => g.section)).toEqual(["A", "正文"]);
    expect(groups[0]?.content).toBe("a1\n\na2");
  });

  it("超出 token 预算的章节切成多组", () => {
    const groups = groupBySections(
      [
        chunk({ sectionPath: ["A"], tokenCount: 4000 }),
        chunk({ sectionPath: ["A"], tokenCount: 4000 }),
        chunk({ sectionPath: ["A"], tokenCount: 4000 }),
      ],
      6000,
    );

    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.section === "A")).toBe(true);
  });
});
