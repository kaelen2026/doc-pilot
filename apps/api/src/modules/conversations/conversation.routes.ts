import { CHAT_SSE_EVENTS } from "@doc-pilot/contracts";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../../shared/types";
import { activeWorkspaceId } from "../../shared/workspace";
import type { CitationRow, MessageRow } from "./conversation.repository";
import { parseCreateConversation, parseSubmitMessage } from "./conversation.schema";
import {
  createConversation,
  errorCodeOf,
  generateAnswer,
  getMessages,
  listConversations,
  prepareSubmission,
} from "./conversation.service";

export function createConversationRoutes() {
  return new Hono<AppEnv>()
    .post("/", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const input = parseCreateConversation(await c.req.json().catch(() => null));
      const conversation = await createConversation({
        workspaceId,
        userId: c.get("user").id,
        input,
      });
      return c.json({ conversation }, 201);
    })
    .get("/", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const conversations = await listConversations({
        workspaceId,
        documentId: c.req.query("documentId"),
      });
      return c.json({ conversations });
    })
    .get("/:id/messages", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const messages = await getMessages({ workspaceId, conversationId: c.req.param("id") });
      return c.json({ messages: messages.map(serializeMessage) });
    })
    .post("/:id/messages", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const input = parseSubmitMessage(await c.req.json().catch(() => null));
      const prepared = await prepareSubmission({
        workspaceId,
        conversationId: c.req.param("id"),
        input,
      });

      // 幂等命中已完成的回答:直接返回 JSON,不再走 SSE(rag.md §23.3)。
      if (prepared.kind === "existing") {
        return c.json({
          replayed: true,
          message: serializeMessage({
            ...prepared.assistantMessage,
            citations: prepared.citations,
          }),
        });
      }

      const { assistantMessage } = prepared;
      // SSE 事件流(rag.md §22.3)。流已开始后错误无法改状态码,一律转 message.failed。
      return streamSSE(c, async (stream) => {
        const write = (event: string, data: unknown) =>
          stream.writeSSE({ event, data: JSON.stringify(data) });

        await write(CHAT_SSE_EVENTS.messageStarted, { messageId: assistantMessage.id });
        try {
          const outcome = await generateAnswer({
            conversation: prepared.conversation,
            document: prepared.document,
            userMessage: prepared.userMessage,
            assistantMessage,
            userId: c.get("user").id,
            callbacks: {
              onRetrievalCompleted: (sourceCount) =>
                write(CHAT_SSE_EVENTS.retrievalCompleted, { sourceCount }),
              onDelta: (text) => write(CHAT_SSE_EVENTS.messageDelta, { text }),
            },
          });

          for (const citation of outcome.citations) {
            await write(CHAT_SSE_EVENTS.citation, {
              citationId: citation.id,
              chunkId: citation.documentChunkId,
              pageStart: citation.pageStart,
              pageEnd: citation.pageEnd,
              position: citation.position,
            });
          }
          if (outcome.usage) {
            await write(CHAT_SSE_EVENTS.usage, {
              inputTokens: outcome.usage.inputTokens,
              outputTokens: outcome.usage.outputTokens,
              costMicros: outcome.usage.costMicros,
            });
          }
          await write(CHAT_SSE_EVENTS.messageCompleted, {
            messageId: assistantMessage.id,
            insufficientEvidence: outcome.insufficientEvidence,
          });
        } catch (err) {
          console.error("[conversations] 生成失败:", err);
          await write(CHAT_SSE_EVENTS.messageFailed, {
            messageId: assistantMessage.id,
            errorCode: errorCodeOf(err),
          });
        }
      });
    });
}

function serializeMessage(message: MessageRow & { citations: CitationRow[] }) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    errorCode: message.errorCode,
    // user 消息携带幂等键,前端对 failed 回答重试时原样重发(rag.md §23.3)。
    clientRequestId: message.clientRequestId,
    createdAt: message.createdAt,
    citations: message.citations.map((c) => ({
      id: c.id,
      chunkId: c.documentChunkId,
      quote: c.quote,
      claim: c.claim,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      score: c.score,
      position: c.position,
    })),
  };
}
