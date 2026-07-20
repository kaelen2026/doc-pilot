import { describe, expect, it } from "vitest";
import { findQuestionFor } from "./find-question";
import type { MessageItem } from "./types";

function msg(id: string, role: "user" | "assistant"): MessageItem {
  return {
    id,
    role,
    content: `内容-${id}`,
    status: "completed",
    errorCode: null,
    clientRequestId: role === "user" ? `req-${id}` : null,
    createdAt: "2026-01-01T00:00:00Z",
    citations: [],
  };
}

describe("findQuestionFor", () => {
  const messages = [
    msg("u1", "user"),
    msg("a1", "assistant"),
    msg("u2", "user"),
    msg("a2", "assistant"),
  ];

  it("取助手消息之前最近的一条 user 提问", () => {
    expect(findQuestionFor(messages, "a2")?.id).toBe("u2");
    expect(findQuestionFor(messages, "a1")?.id).toBe("u1");
  });

  it("助手消息不存在 → undefined", () => {
    expect(findQuestionFor(messages, "nope")).toBeUndefined();
  });

  it("之前没有 user 消息 → undefined", () => {
    expect(findQuestionFor([msg("a0", "assistant")], "a0")).toBeUndefined();
  });
});
