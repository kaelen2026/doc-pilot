/**
 * 问答会话的稳定契约(rag.md §17–§18、§22):消息取值、SSE 事件名、检索预算。
 * Web / API 双方引用,避免事件名等魔法字符串漂移。
 */

export const MESSAGE_ROLE = ["user", "assistant"] as const;
export type MessageRole = (typeof MESSAGE_ROLE)[number];

export const MESSAGE_STATUS = ["pending", "completed", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUS)[number];

/** SSE 事件名(rag.md §22.3)。 */
export const CHAT_SSE_EVENTS = {
  messageStarted: "message.started",
  retrievalCompleted: "retrieval.completed",
  messageDelta: "message.delta",
  citation: "citation",
  usage: "usage",
  messageCompleted: "message.completed",
  messageFailed: "message.failed",
} as const;
export type ChatSSEEvent = (typeof CHAT_SSE_EVENTS)[keyof typeof CHAT_SSE_EVENTS];

/** 检索与上下文预算(rag.md §17.3、§18.1)。 */
export const RETRIEVAL = {
  /** 向量召回候选数。 */
  candidateLimit: 20,
  /** 注入 Prompt 的来源上限。 */
  maxSources: 8,
  /** 检索上下文 Token 预算。 */
  contextTokenBudget: 6000,
  /** 对话历史 Token 预算。 */
  historyTokenBudget: 2000,
} as const;

/** 用户单次提问的长度上限(字符)。 */
export const MAX_QUESTION_CHARS = 4000;
