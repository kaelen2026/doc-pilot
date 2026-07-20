import {
  type AIMessage,
  type AIUsage,
  buildAnswerUserMessage,
  isAIError,
  parseAnswerStream,
  validateAnswer,
} from "@doc-pilot/ai";
import { RETRIEVAL } from "@doc-pilot/contracts";
import { errToLog, logger, ragMetrics, withSpan } from "@doc-pilot/observability";
import { apiAIGateway } from "../../ai/gateway";
import { NotFoundError } from "../../shared/errors";
import { assertAskQuota } from "../quota/quota.service";
import { AnswerRejectedError, ConflictError } from "./conversation.errors";
import {
  type AskableDocument,
  type CitationRow,
  type ConversationRow,
  type MessageRow,
  scopedConversationRepo,
} from "./conversation.repository";
import type { CreateConversationInput, SubmitMessageInput } from "./conversation.schema";
import { selectSources, toCitationSources } from "./retrieval";

/** 允许问答的文档状态(pipeline.md §13:partially_ready = 向量就绪、仅摘要失败)。 */
const ASKABLE_STATUS = new Set(["ready", "partially_ready"]);

const REFUSAL_NO_SOURCES = "当前文档中没有检索到与该问题相关的内容,无法基于该文档回答这个问题。";

export async function createConversation(params: {
  workspaceId: string;
  userId: string;
  input: CreateConversationInput;
}): Promise<ConversationRow> {
  const repo = scopedConversationRepo(params.workspaceId);
  const document = await repo.loadDocument({ documentId: params.input.documentId });
  if (!document) {
    throw new NotFoundError("document not found");
  }
  return repo.createConversation({
    documentId: document.id,
    userId: params.userId,
    title: params.input.title ?? null,
  });
}

export async function listConversations(params: {
  workspaceId: string;
  documentId?: string;
}): Promise<ConversationRow[]> {
  return scopedConversationRepo(params.workspaceId).listConversations({
    documentId: params.documentId,
  });
}

export interface MessageWithCitations extends MessageRow {
  citations: CitationRow[];
}

export async function getMessages(params: {
  workspaceId: string;
  conversationId: string;
  limit: number;
}): Promise<{ messages: MessageWithCitations[]; hasMore: boolean }> {
  const repo = scopedConversationRepo(params.workspaceId);
  const conversation = await repo.getConversation({ conversationId: params.conversationId });
  if (!conversation) {
    throw new NotFoundError("conversation not found");
  }
  const { messages: rows, hasMore } = await repo.listMessagesPage({
    conversationId: conversation.id,
    limit: params.limit,
  });
  const citationRows = await repo.listCitationsByMessageIds(rows.map((m) => m.id));
  const byMessage = new Map<string, CitationRow[]>();
  for (const citation of citationRows) {
    const list = byMessage.get(citation.messageId) ?? [];
    list.push(citation);
    byMessage.set(citation.messageId, list);
  }
  return { messages: rows.map((m) => ({ ...m, citations: byMessage.get(m.id) ?? [] })), hasMore };
}

export type PreparedSubmission =
  | {
      kind: "existing";
      assistantMessage: MessageRow;
      citations: CitationRow[];
    }
  | {
      kind: "generate";
      conversation: ConversationRow;
      document: AskableDocument;
      userMessage: MessageRow;
      assistantMessage: MessageRow;
    };

/**
 * 提问前置处理(rag.md §22.2 前半):鉴权后校验会话与文档,再做幂等检查(§23.3):
 * - pending → 409(已有生成在进行,MVP 不重放流)
 * - completed → 返回已有消息
 * - failed → 复位为 pending 重新生成
 * - 不存在 → 原子写入 user + assistant(pending) 消息对
 */
export async function prepareSubmission(params: {
  workspaceId: string;
  conversationId: string;
  input: SubmitMessageInput;
}): Promise<PreparedSubmission> {
  const repo = scopedConversationRepo(params.workspaceId);
  const conversation = await repo.getConversation({ conversationId: params.conversationId });
  if (!conversation) {
    throw new NotFoundError("conversation not found");
  }
  const document = await repo.loadDocument({ documentId: conversation.documentId });
  if (!document) {
    throw new NotFoundError("document not found");
  }
  if (!ASKABLE_STATUS.has(document.status)) {
    throw new ConflictError("document_not_ready", `document status is ${document.status}`);
  }

  // 与并发重复提交竞争:插入撞唯一约束后回到幂等查询,最多再试一次。
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await repo.findQuestionPair({
      conversationId: conversation.id,
      clientRequestId: params.input.clientRequestId,
    });
    if (existing) {
      const assistant = existing.assistantMessage;
      if (!assistant) {
        // 消息对是原子写入的,缺配对回复说明数据异常,不吞。
        throw new Error(`user message ${existing.userMessage.id} 缺少配对的 assistant 消息`);
      }
      if (assistant.status === "pending") {
        throw new ConflictError("generation_in_progress", "该请求正在生成中,请稍后查询消息");
      }
      if (assistant.status === "completed") {
        const citations = await repo.listCitationsByMessageIds([assistant.id]);
        return { kind: "existing", assistantMessage: assistant, citations };
      }
      // failed → 显式重试。重试不新增提问,不再计配额(问题已在配额内计过)。
      await repo.resetAssistantForRetry(assistant.id);
      return {
        kind: "generate",
        conversation,
        document,
        userMessage: existing.userMessage,
        assistantMessage: { ...assistant, status: "pending", content: "", errorCode: null },
      };
    }

    // 新提问:配额检查在昂贵操作(检索 + 生成)之前(§27.2)。仅拦新问题,不拦幂等重放。
    await assertAskQuota({ workspaceId: params.workspaceId });

    const pair = await repo.insertQuestionPair({
      conversationId: conversation.id,
      content: params.input.content,
      clientRequestId: params.input.clientRequestId,
    });
    if (pair) {
      return { kind: "generate", conversation, document, ...pair };
    }
  }
  throw new ConflictError("generation_in_progress", "重复提交竞争,请稍后重试");
}

export interface GenerateCallbacks {
  onRetrievalCompleted(sourceCount: number): Promise<void> | void;
  onDelta(text: string): Promise<void> | void;
}

export interface GenerateOutcome {
  content: string;
  citations: CitationRow[];
  insufficientEvidence: boolean;
  usage: AIUsage | null;
}

/**
 * 检索 → 构造 Prompt → 流式生成 → 引用校验 → 落库(rag.md §22.2 后半)。
 * 任一环节失败都会把 assistant 消息标记为 failed(错误码保留),再向上抛。
 */
export async function generateAnswer(params: {
  conversation: ConversationRow;
  document: AskableDocument;
  userMessage: MessageRow;
  assistantMessage: MessageRow;
  userId: string;
  callbacks: GenerateCallbacks;
}): Promise<GenerateOutcome> {
  const { conversation, document, userMessage, assistantMessage, callbacks } = params;
  const repo = scopedConversationRepo(conversation.workspaceId);
  const gateway = apiAIGateway();
  const metadata = {
    workspaceId: conversation.workspaceId,
    userId: params.userId,
    documentId: document.id,
    traceId: assistantMessage.id,
  };

  try {
    const candidates = await repo.retrieveCandidates({
      gateway,
      question: userMessage.content,
      documentId: document.id,
      processingVersion: document.processingVersion,
      metadata,
    });
    const sources = selectSources(candidates);
    // 检索指标(§29.2):命中来源数 + 最高相似度(candidates 已按分降序)。
    ragMetrics.retrieval(sources.length, candidates[0]?.score ?? null);
    await callbacks.onRetrievalCompleted(sources.length);

    // 无证据 → 显式拒答(ADR-007),不调用生成模型。
    if (sources.length === 0) {
      await repo.completeAssistant({
        assistantMessageId: assistantMessage.id,
        content: REFUSAL_NO_SOURCES,
        validatedCitations: [],
      });
      ragMetrics.answer({ citationCount: 0, invalidCitationCount: 0, insufficientEvidence: true });
      await callbacks.onDelta(REFUSAL_NO_SOURCES);
      return {
        content: REFUSAL_NO_SOURCES,
        citations: [],
        insufficientEvidence: true,
        usage: null,
      };
    }

    const citationSources = toCitationSources(sources, document.id);
    const history = pickHistory(
      await repo.listCompletedMessagesBefore({
        conversationId: conversation.id,
        beforeMessageId: userMessage.id,
      }),
      RETRIEVAL.historyTokenBudget,
    );

    // ai.generate span 覆盖 streamText 调用 + 流式消费,直到拿到结构化答案。
    const generated = await withSpan("ai.generate", async () => {
      const stream = await gateway.streamText({
        capability: "answer",
        promptId: "document-answer",
        promptVersion: "1.0.0",
        messages: [
          ...history,
          {
            role: "user",
            content: buildAnswerUserMessage({
              sources: citationSources,
              question: userMessage.content,
            }),
          },
        ],
        metadata,
      });
      const parsed = parseAnswerStream(stream.textStream);
      for await (const delta of parsed.textDeltas) {
        await callbacks.onDelta(delta);
      }
      return { answer: await parsed.answer, usage: stream.usage };
    });
    const { answer } = generated;

    const validation = await withSpan("citation.validate", () =>
      validateAnswer(answer, { sources: citationSources, documentId: document.id }),
    );
    if (!validation.ok) {
      ragMetrics.answer({
        citationCount: 0,
        invalidCitationCount: validation.issues.length,
        insufficientEvidence: false,
      });
      throw new AnswerRejectedError(validation.issues);
    }

    const citationRows = await withSpan("database.persist_message", () =>
      repo.completeAssistant({
        assistantMessageId: assistantMessage.id,
        content: answer.answer,
        validatedCitations: validation.citations,
      }),
    );
    ragMetrics.answer({
      citationCount: citationRows.length,
      invalidCitationCount: 0,
      insufficientEvidence: answer.insufficientEvidence,
    });
    const usage = await generated.usage.catch(() => null);
    return {
      content: answer.answer,
      citations: citationRows,
      insufficientEvidence: answer.insufficientEvidence,
      usage,
    };
  } catch (err) {
    await repo
      .failAssistant({ assistantMessageId: assistantMessage.id, errorCode: errorCodeOf(err) })
      .catch((markErr) =>
        logger.error("chat.mark_failed_error", {
          messageId: assistantMessage.id,
          ...errToLog(markErr),
        }),
      );
    throw err;
  }
}

export function errorCodeOf(err: unknown): string {
  if (err instanceof AnswerRejectedError) {
    return err.code;
  }
  if (isAIError(err)) {
    return err.code;
  }
  return "INTERNAL";
}

/**
 * 对话历史(rag.md §18.1:最多 2000 Tokens):从最近往前取已完成消息,
 * 超预算即停,返回按时间正序的 AIMessage。纯函数,便于单测。
 */
export function pickHistory(
  rows: Array<Pick<MessageRow, "role" | "content">>,
  tokenBudget: number,
): AIMessage[] {
  const picked: AIMessage[] = [];
  let used = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || (row.role !== "user" && row.role !== "assistant")) {
      continue;
    }
    const tokens = estimateTokens(row.content);
    if (used + tokens > tokenBudget) {
      break;
    }
    used += tokens;
    picked.unshift({ role: row.role, content: row.content });
  }
  return picked;
}

/** 与 Worker 同口径的粗略估算:≈4 字符 1 token。 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
