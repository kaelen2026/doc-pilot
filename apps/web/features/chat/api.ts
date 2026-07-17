import { API_URL } from "@/lib/env";
import type { ChatStreamEvent, ConversationItem, MessageItem } from "./types";

async function requireOk(r: Response): Promise<Response> {
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `HTTP ${r.status}`);
  }
  return r;
}

/**
 * 取得该文档的会话:已有则复用第一个,没有则创建。
 * MVP 一文档一会话;会话管理(多会话/改名)后续再做。
 */
export async function ensureConversation(documentId: string): Promise<ConversationItem> {
  const list = await requireOk(
    await fetch(`${API_URL}/conversations?documentId=${encodeURIComponent(documentId)}`, {
      credentials: "include",
    }),
  );
  const { conversations } = (await list.json()) as { conversations: ConversationItem[] };
  const existing = conversations[0];
  if (existing) {
    return existing;
  }
  const created = await requireOk(
    await fetch(`${API_URL}/conversations`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId }),
    }),
  );
  const { conversation } = (await created.json()) as { conversation: ConversationItem };
  return conversation;
}

export async function fetchMessages(conversationId: string): Promise<MessageItem[]> {
  const r = await requireOk(
    await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
      credentials: "include",
    }),
  );
  const { messages } = (await r.json()) as { messages: MessageItem[] };
  return messages;
}

/**
 * 提问并消费 SSE 流(rag.md §22.3 事件序列)。
 * - 幂等命中已完成回答时 API 返回 JSON 而非 SSE,归一为 `replayed` 事件;
 * - 409(生成中/重复竞争)与其他错误抛 Error,由调用方展示。
 */
export async function* streamAnswer(input: {
  conversationId: string;
  content: string;
  clientRequestId: string;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent> {
  const r = await fetch(`${API_URL}/conversations/${input.conversationId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: input.content, clientRequestId: input.clientRequestId }),
    signal: input.signal,
  });

  if (r.headers.get("content-type")?.includes("application/json")) {
    // 两种 JSON 形状:错误 {error, message: string} / 幂等重放 {replayed, message: MessageItem}。
    const body = (await r.json()) as Record<string, unknown>;
    if (!r.ok) {
      const detail = typeof body.message === "string" ? body.message : String(body.error ?? "");
      throw new Error(detail || `HTTP ${r.status}`);
    }
    if (typeof body.message !== "object" || body.message === null) {
      throw new Error("unexpected response shape");
    }
    yield { event: "replayed", data: { message: body.message as MessageItem } };
    return;
  }
  if (!r.ok || !r.body) {
    throw new Error(`HTTP ${r.status}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      // SSE 以空行分帧;帧内可能有多行 data。
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseFrame(frame);
        if (parsed) {
          yield parsed;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): ChatStreamEvent | null {
  let event = "";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!event || dataLines.length === 0) {
    return null;
  }
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) } as ChatStreamEvent;
  } catch {
    return null;
  }
}
