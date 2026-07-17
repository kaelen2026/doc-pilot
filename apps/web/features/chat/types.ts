/** 与 apps/api conversations 模块 serializeMessage / SSE 事件对应的前端 DTO。 */

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
  role: "user" | "assistant";
  content: string;
  status: "pending" | "completed" | "failed";
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

/** SSE 事件负载(契约见 @doc-pilot/contracts CHAT_SSE_EVENTS)。 */
export type ChatStreamEvent =
  | { event: "message.started"; data: { messageId: string } }
  | { event: "retrieval.completed"; data: { sourceCount: number } }
  | { event: "message.delta"; data: { text: string } }
  | {
      event: "citation";
      data: {
        citationId: string;
        chunkId: string;
        pageStart: number | null;
        pageEnd: number | null;
        position: number;
      };
    }
  | { event: "usage"; data: { inputTokens: number; outputTokens: number; costMicros: number } }
  | { event: "message.completed"; data: { messageId: string; insufficientEvidence: boolean } }
  | { event: "message.failed"; data: { messageId: string; errorCode: string } }
  /** 幂等命中已完成回答时 API 直接返回 JSON,归一成一个本地事件。 */
  | { event: "replayed"; data: { message: MessageItem } };
