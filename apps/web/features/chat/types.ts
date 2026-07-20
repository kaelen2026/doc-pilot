/** 与 apps/api conversations 模块 serializeMessage / SSE 事件对应的前端 DTO。 */

import type { CHAT_SSE_EVENTS, MessageRole, MessageStatus } from "@doc-pilot/contracts";

/** 文档详情(问答页头部与状态门禁用)。对应 GET /documents/:id。 */
export interface DocDetail {
  id: string;
  title: string;
  status: string;
  pageCount: number | null;
}

export interface CitationItem {
  id: string;
  chunkId: string;
  quote: string;
  claim: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  score: string | null;
  position: number;
}

export interface MessageItem {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  errorCode: string | null;
  /** user 消息携带,失败重试时原样重发(rag.md §23.3)。 */
  clientRequestId: string | null;
  createdAt: string;
  citations: CitationItem[];
}

export interface ConversationItem {
  id: string;
  documentId: string;
  title: string | null;
  createdAt: string;
}

/**
 * SSE 事件负载。事件名不写字面量,绑定到契约 CHAT_SSE_EVENTS——契约里改名会在此处编译报错,
 * 杜绝前后端事件名静默漂移。
 */
export type ChatStreamEvent =
  | { event: typeof CHAT_SSE_EVENTS.messageStarted; data: { messageId: string } }
  | { event: typeof CHAT_SSE_EVENTS.retrievalCompleted; data: { sourceCount: number } }
  | { event: typeof CHAT_SSE_EVENTS.messageDelta; data: { text: string } }
  | {
      event: typeof CHAT_SSE_EVENTS.citation;
      data: {
        citationId: string;
        chunkId: string;
        pageStart: number | null;
        pageEnd: number | null;
        position: number;
      };
    }
  | {
      event: typeof CHAT_SSE_EVENTS.usage;
      data: { inputTokens: number; outputTokens: number; costMicros: number };
    }
  | {
      event: typeof CHAT_SSE_EVENTS.messageCompleted;
      data: { messageId: string; insufficientEvidence: boolean };
    }
  | { event: typeof CHAT_SSE_EVENTS.messageFailed; data: { messageId: string; errorCode: string } }
  /** 幂等命中已完成回答时 API 直接返回 JSON,归一成一个本地事件(非契约事件)。 */
  | { event: "replayed"; data: { message: MessageItem } };
