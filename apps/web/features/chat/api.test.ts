import { describe, expect, it } from "vitest";
import { parseFrame } from "./api";

describe("parseFrame", () => {
  it("解析 event + data 行为归一事件", () => {
    expect(parseFrame('event: message.delta\ndata: {"text":"你好"}')).toEqual({
      event: "message.delta",
      data: { text: "你好" },
    });
  });

  it("支持多行 data(拼回后再 JSON.parse)", () => {
    expect(parseFrame('event: usage\ndata: {"inputTokens":1,\ndata: "outputTokens":2}')).toEqual({
      event: "usage",
      data: { inputTokens: 1, outputTokens: 2 },
    });
  });

  it("缺 event 或 data → null", () => {
    expect(parseFrame('data: {"text":"x"}')).toBeNull();
    expect(parseFrame("event: message.delta")).toBeNull();
  });

  it("data 非法 JSON → null(不抛)", () => {
    expect(parseFrame("event: message.delta\ndata: {坏的")).toBeNull();
  });
});
