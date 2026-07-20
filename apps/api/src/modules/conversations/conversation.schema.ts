import { MAX_QUESTION_CHARS } from "@doc-pilot/contracts";
import { ValidationError } from "../../shared/errors";

export interface CreateConversationInput {
  documentId: string;
  title?: string;
}

export function parseCreateConversation(body: unknown): CreateConversationInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("request body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.documentId !== "string" || b.documentId.trim() === "") {
    throw new ValidationError("documentId is required");
  }
  if (b.title !== undefined && typeof b.title !== "string") {
    throw new ValidationError("title must be a string");
  }
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 255) : undefined;
  return { documentId: b.documentId, title: title || undefined };
}

export interface SubmitMessageInput {
  content: string;
  clientRequestId: string;
}

/** 提问请求体(rag.md §22.1)。clientRequestId 是幂等键,必填。 */
export function parseSubmitMessage(body: unknown): SubmitMessageInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("request body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.content !== "string" || b.content.trim() === "") {
    throw new ValidationError("content is required");
  }
  if (b.content.length > MAX_QUESTION_CHARS) {
    throw new ValidationError(`content too long: max ${MAX_QUESTION_CHARS} chars`);
  }
  if (typeof b.clientRequestId !== "string" || b.clientRequestId.trim() === "") {
    throw new ValidationError("clientRequestId is required");
  }
  if (b.clientRequestId.length > 100) {
    throw new ValidationError("clientRequestId too long: max 100 chars");
  }
  return { content: b.content.trim(), clientRequestId: b.clientRequestId };
}
