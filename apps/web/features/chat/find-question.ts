import type { MessageItem } from "./types";

/**
 * 找到某条助手消息对应的提问:消息流里它之前最近的一条 user 消息(rag.md §23.3)。
 * 用于失败重试——原样重发那次提问。纯逻辑,便于单测。
 */
export function findQuestionFor(
  messages: MessageItem[],
  assistantId: string,
): MessageItem | undefined {
  const index = messages.findIndex((m) => m.id === assistantId);
  if (index < 0) {
    return undefined;
  }
  return messages
    .slice(0, index)
    .reverse()
    .find((m) => m.role === "user");
}
