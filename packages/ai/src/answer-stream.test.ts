import { describe, expect, it } from "vitest";
import { parseAnswerStream } from "./answer-stream";
import { isAIError } from "./errors";
import { ANSWER_CITATIONS_MARKER } from "./prompts/document-answer/v1";

async function* chunksOf(...parts: string[]): AsyncIterable<string> {
  for (const part of parts) {
    yield part;
  }
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of stream) {
    out.push(delta);
  }
  return out;
}

const TAIL = JSON.stringify({
  insufficientEvidence: false,
  citations: [{ sourceId: "S1", quote: "原文片段", claim: "结论" }],
});

describe("parseAnswerStream", () => {
  it("正文透传,尾部解析为引用", async () => {
    const { textDeltas, answer } = parseAnswerStream(
      chunksOf("答案第一段。", "第二段。\n", `${ANSWER_CITATIONS_MARKER}\n`, TAIL),
    );
    const deltas = await collect(textDeltas);
    expect(deltas.join("")).toBe("答案第一段。第二段。\n");
    const parsed = await answer;
    expect(parsed.answer).toBe("答案第一段。第二段。");
    expect(parsed.citations).toEqual([{ sourceId: "S1", quote: "原文片段", claim: "结论" }]);
    expect(parsed.insufficientEvidence).toBe(false);
  });

  it("正文内嵌的 [n] 引用标记原样透传(解析器不识别、不吞标记)", async () => {
    const tail = JSON.stringify({
      insufficientEvidence: false,
      citations: [
        { sourceId: "S1", quote: "片段一", claim: "结论一" },
        { sourceId: "S2", quote: "片段二", claim: "结论二" },
      ],
    });
    const { textDeltas, answer } = parseAnswerStream(
      chunksOf("结论一[1],", "结论二[2]。\n", `${ANSWER_CITATIONS_MARKER}\n`, tail),
    );
    expect((await collect(textDeltas)).join("")).toBe("结论一[1],结论二[2]。\n");
    const parsed = await answer;
    expect(parsed.answer).toBe("结论一[1],结论二[2]。");
    expect(parsed.citations).toHaveLength(2);
  });

  it("标记被切分到多个 delta 时不漏正文、不泄漏标记", async () => {
    const { textDeltas, answer } = parseAnswerStream(
      chunksOf("结论是 A==", "=CITATIONS=", `==${TAIL.slice(0, 10)}`, TAIL.slice(10)),
    );
    const deltas = await collect(textDeltas);
    expect(deltas.join("")).toBe("结论是 A");
    expect((await answer).citations).toHaveLength(1);
  });

  it("正文中的孤立等号正常吐出", async () => {
    const { textDeltas, answer } = parseAnswerStream(
      chunksOf("a=b 且 c==d", `\n${ANSWER_CITATIONS_MARKER}`, TAIL),
    );
    expect((await collect(textDeltas)).join("")).toBe("a=b 且 c==d\n");
    expect((await answer).answer).toBe("a=b 且 c==d");
  });

  it("尾部带 markdown 围栏也能解析", async () => {
    const { textDeltas, answer } = parseAnswerStream(
      chunksOf(
        "拒答。",
        ANSWER_CITATIONS_MARKER,
        "\n```json\n",
        '{"insufficientEvidence":true,"citations":[]}',
        "\n```",
      ),
    );
    await collect(textDeltas);
    const parsed = await answer;
    expect(parsed.insufficientEvidence).toBe(true);
    expect(parsed.citations).toEqual([]);
  });

  it("缺少标记 → AI_INVALID_RESPONSE", async () => {
    const { textDeltas, answer } = parseAnswerStream(chunksOf("只有正文没有引用"));
    await expect(collect(textDeltas)).rejects.toSatisfy(
      (err: unknown) => isAIError(err) && err.code === "AI_INVALID_RESPONSE",
    );
    await expect(answer).rejects.toSatisfy(
      (err: unknown) => isAIError(err) && err.code === "AI_INVALID_RESPONSE",
    );
  });

  it("尾部非法 JSON → AI_INVALID_RESPONSE", async () => {
    const { textDeltas, answer } = parseAnswerStream(
      chunksOf("正文", ANSWER_CITATIONS_MARKER, "{broken"),
    );
    await expect(collect(textDeltas)).rejects.toSatisfy(
      (err: unknown) => isAIError(err) && err.code === "AI_INVALID_RESPONSE",
    );
    await expect(answer).rejects.toBeTruthy();
  });
});
