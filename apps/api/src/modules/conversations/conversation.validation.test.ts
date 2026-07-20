import { describe, expect, it } from "vitest";
import { DomainError } from "../../shared/errors";
import { parseCreateConversation, parseSubmitMessage } from "./conversation.schema";
import { pickHistory } from "./conversation.service";

describe("parseCreateConversation", () => {
  it("documentId 必填", () => {
    expect(() => parseCreateConversation({})).toThrow(DomainError);
    expect(parseCreateConversation({ documentId: "doc-1" })).toEqual({
      documentId: "doc-1",
      title: undefined,
    });
  });
});

describe("parseSubmitMessage", () => {
  it("content 与 clientRequestId 必填", () => {
    expect(() => parseSubmitMessage({ content: "问题" })).toThrow(/clientRequestId/);
    expect(() => parseSubmitMessage({ clientRequestId: "01J" })).toThrow(/content/);
    expect(parseSubmitMessage({ content: " 问题 ", clientRequestId: "01J" })).toEqual({
      content: "问题",
      clientRequestId: "01J",
    });
  });

  it("超长内容被拒", () => {
    expect(() => parseSubmitMessage({ content: "a".repeat(4001), clientRequestId: "01J" })).toThrow(
      /too long/,
    );
  });
});

describe("pickHistory", () => {
  it("从最近往前取,超预算即停,输出保持时间正序", () => {
    const rows = [
      { role: "user", content: "a".repeat(400) }, // 100 tokens
      { role: "assistant", content: "b".repeat(400) },
      { role: "user", content: "c".repeat(400) },
      { role: "assistant", content: "d".repeat(400) },
    ];
    const history = pickHistory(rows, 250);
    expect(history).toHaveLength(2);
    expect(history[0]?.content.startsWith("c")).toBe(true);
    expect(history[1]?.content.startsWith("d")).toBe(true);
  });

  it("预算不足时可为空", () => {
    expect(pickHistory([{ role: "user", content: "a".repeat(4000) }], 100)).toEqual([]);
  });
});
