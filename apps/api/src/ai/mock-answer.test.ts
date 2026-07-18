import {
  buildAnswerUserMessage,
  type CitationSource,
  parseAnswerStream,
  validateAnswer,
} from "@doc-pilot/ai";
import { describe, expect, it } from "vitest";
import { mockAnswerChunks } from "./mock-answer";

const DOC_ID = "doc-1";

const SOURCES: CitationSource[] = [
  {
    sourceId: "S1",
    documentId: DOC_ID,
    chunkId: "chunk-1",
    text: "DocPilot 采用服务端 Session 以支持主动撤销,并便于服务端集中控制会话生命周期。",
    pageStart: 12,
    pageEnd: 12,
  },
  {
    sourceId: "S2",
    documentId: DOC_ID,
    chunkId: "chunk-2",
    text: "文件上传走预签名直传,完成后经 Outbox 异步入队解析。",
    pageStart: 3,
  },
];

async function drain(chunks: string[]) {
  async function* gen(): AsyncIterable<string> {
    for (const chunk of chunks) {
      yield chunk;
    }
  }
  const parsed = parseAnswerStream(gen());
  let body = "";
  for await (const delta of parsed.textDeltas) {
    body += delta;
  }
  return { body, answer: await parsed.answer };
}

describe("mockAnswerChunks", () => {
  it("从注入的来源片段派生出能过校验的有效引用", async () => {
    const userMessage = buildAnswerUserMessage({
      sources: SOURCES,
      question: "为什么选择服务端 Session?",
    });
    const chunks = mockAnswerChunks({ messages: [{ role: "user", content: userMessage }] });

    const { body, answer } = await drain(chunks);
    expect(body.length).toBeGreaterThan(0);
    expect(answer.insufficientEvidence).toBe(false);
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]?.sourceId).toBe("S1");

    const result = validateAnswer(answer, { sources: SOURCES, documentId: DOC_ID });
    expect(result.ok).toBe(true);
    expect(result.citations[0]?.matchScore).toBe(1);
  });

  it("解析不出来源时回落显式拒答", async () => {
    const chunks = mockAnswerChunks({ messages: [{ role: "user", content: "没有来源的问题" }] });
    const { answer } = await drain(chunks);
    expect(answer.insufficientEvidence).toBe(true);
    expect(answer.citations).toHaveLength(0);
  });
});
