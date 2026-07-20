import {
  type AIGateway,
  type AIMetadata,
  buildAnswerUserMessage,
  type CitationSource,
  parseAnswerStream,
  validateAnswer,
} from "@doc-pilot/ai";
import { EMBEDDING_VERSION, RETRIEVAL } from "@doc-pilot/contracts";
import { db } from "@doc-pilot/database";
import { documentChunks, documents, user, workspaces } from "@doc-pilot/database/schema";
import { and, cosineDistance, eq, isNotNull, sql } from "drizzle-orm";
import type { EvalCase, EvalDataset } from "./dataset";
import { JudgeSchema } from "./judge";
import type { CaseAnswerMetrics, CaseRetrievalMetrics } from "./metrics";
import { recallAtK, reciprocalRank } from "./metrics";

export interface IngestedFixture {
  workspaceId: string;
  userId: string;
  /** 文档名 → documentId。 */
  documentIds: Map<string, string>;
  cleanup(): Promise<void>;
}

/**
 * 评测语料入库:独立 user + workspace,预切片语料经 Gateway embed 后写入
 * document_chunks——与线上同库同查询路径,评测覆盖真实的 pgvector 行为。
 */
export async function ingestDataset(
  gateway: AIGateway,
  dataset: EvalDataset,
): Promise<IngestedFixture> {
  const runId = `eval-${Date.now().toString(36)}`;
  const [evalUser] = await db
    .insert(user)
    .values({
      id: runId,
      name: "eval-runner",
      email: `${runId}@eval.local`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: runId, ownerId: evalUser!.id })
    .returning();

  const documentIds = new Map<string, string>();
  for (const [name, chunks] of dataset.documents) {
    const [doc] = await db
      .insert(documents)
      .values({
        workspaceId: workspace!.id,
        ownerId: evalUser!.id,
        title: name,
        originalFilename: `${name}.jsonl`,
        mimeType: "application/pdf",
        sizeBytes: 1,
        status: "ready",
        processingVersion: 1,
      })
      .returning();
    documentIds.set(name, doc!.id);

    const metadata: AIMetadata = { workspaceId: workspace!.id, documentId: doc!.id };
    const { embeddings } = await gateway.embed({
      capability: "embedding",
      texts: chunks.map((c) => c.content),
      metadata,
    });
    await db.insert(documentChunks).values(
      chunks.map((c, i) => ({
        workspaceId: workspace!.id,
        documentId: doc!.id,
        processingVersion: 1,
        chunkIndex: c.chunkIndex,
        content: c.content,
        contentHash: `${name}-${c.chunkIndex}`,
        tokenCount: Math.max(1, Math.ceil(c.content.length / 4)),
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        metadata: {},
        embedding: embeddings[i],
        embeddingModel: "eval",
        embeddingVersion: EMBEDDING_VERSION,
      })),
    );
  }

  return {
    workspaceId: workspace!.id,
    userId: evalUser!.id,
    documentIds,
    async cleanup() {
      await db.delete(workspaces).where(eq(workspaces.id, workspace!.id));
      await db.delete(user).where(eq(user.id, evalUser!.id));
    },
  };
}

interface Candidate {
  chunkId: string;
  /** chunk 真实归属文档,与线上同口径:引用跨文档校验的比对基准。 */
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageStart: number | null;
  pageEnd: number | null;
  score: number;
}

/** 与 rag.md §17.1 / API retrieval 同款查询:租户 + 文档 + 版本过滤都在 SQL 内。 */
async function retrieve(
  gateway: AIGateway,
  fixture: IngestedFixture,
  evalCase: EvalCase,
): Promise<Candidate[]> {
  const documentId = fixture.documentIds.get(evalCase.document);
  if (!documentId) {
    throw new Error(`用例 ${evalCase.caseId} 的文档未入库`);
  }
  const { embeddings } = await gateway.embed({
    capability: "embedding",
    texts: [evalCase.question],
    metadata: { workspaceId: fixture.workspaceId, documentId },
  });
  const distance = cosineDistance(documentChunks.embedding, embeddings[0] ?? []);
  return db
    .select({
      chunkId: documentChunks.id,
      documentId: documentChunks.documentId,
      chunkIndex: documentChunks.chunkIndex,
      content: documentChunks.content,
      tokenCount: documentChunks.tokenCount,
      pageStart: documentChunks.pageStart,
      pageEnd: documentChunks.pageEnd,
      score: sql<number>`1 - (${distance})`,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.workspaceId, fixture.workspaceId),
        eq(documentChunks.documentId, documentId),
        eq(documentChunks.processingVersion, 1),
        isNotNull(documentChunks.embedding),
      ),
    )
    .orderBy(distance)
    .limit(RETRIEVAL.candidateLimit);
}

export interface CaseResult {
  retrieval: CaseRetrievalMetrics | null;
  answer: CaseAnswerMetrics | null;
}

/** 跑单个用例:检索指标恒有(可答用例);full 模式追加回答链路与 Judge。 */
export async function runCase(
  gateway: AIGateway,
  fixture: IngestedFixture,
  evalCase: EvalCase,
  mode: "retrieval" | "full",
): Promise<CaseResult> {
  const candidates = await retrieve(gateway, fixture, evalCase);

  const retrieval: CaseRetrievalMetrics | null = evalCase.shouldAnswer
    ? {
        caseId: evalCase.caseId,
        recallAt5: recallAtK(rankedPages(candidates), evalCase.expectedPages, 5),
        recallAt10: recallAtK(rankedPages(candidates), evalCase.expectedPages, 10),
        reciprocalRank: reciprocalRank(rankedPages(candidates), evalCase.expectedPages),
      }
    : null;

  if (mode !== "full") {
    return { retrieval, answer: null };
  }

  // 来源筛选与线上同口径:top-8、6000 token 预算、按 chunkIndex 正序编号。
  const picked: Candidate[] = [];
  let used = 0;
  for (const c of candidates) {
    if (picked.length >= RETRIEVAL.maxSources) {
      break;
    }
    if (used + c.tokenCount > RETRIEVAL.contextTokenBudget) {
      continue;
    }
    used += c.tokenCount;
    picked.push(c);
  }
  const documentId = fixture.documentIds.get(evalCase.document) ?? "";
  const sources: CitationSource[] = picked
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((c, i) => ({
      sourceId: `S${i + 1}`,
      documentId: c.documentId,
      chunkId: c.chunkId,
      text: c.content,
      pageStart: c.pageStart ?? undefined,
      pageEnd: c.pageEnd ?? undefined,
    }));

  const metadata: AIMetadata = { workspaceId: fixture.workspaceId, documentId };
  const stream = await gateway.streamText({
    capability: "answer",
    promptId: "document-answer",
    promptVersion: "1.0.0",
    messages: [
      { role: "user", content: buildAnswerUserMessage({ sources, question: evalCase.question }) },
    ],
    metadata,
  });
  const parsed = parseAnswerStream(stream.textStream);
  for await (const _ of parsed.textDeltas) {
    // 评测只要最终结果,增量丢弃。
  }
  const answer = await parsed.answer;
  const validation = validateAnswer(answer, { sources, documentId });

  // 拒答用例不进 Judge:三个质量分对拒答文本没有意义。
  let judge = null;
  if (!answer.insufficientEvidence) {
    const result = await gateway.generateObject({
      capability: "judge",
      promptId: "eval-judge",
      promptVersion: "1.0.0",
      schema: JudgeSchema,
      variables: {
        question: evalCase.question,
        expectedPoints: evalCase.expectedPoints,
        sources,
        answer: answer.answer,
      },
      metadata,
    });
    judge = result.data;
  }

  return {
    retrieval,
    answer: {
      caseId: evalCase.caseId,
      shouldAnswer: evalCase.shouldAnswer,
      refused: answer.insufficientEvidence,
      citationsClaimed: answer.citations.length,
      citationsValid: validation.citations.length,
      correctness: judge?.correctness ?? null,
      faithfulness: judge?.faithfulness ?? null,
      relevance: judge?.relevance ?? null,
    },
  };
}

function rankedPages(candidates: Candidate[]): { pageStart: number }[] {
  return candidates
    .filter((c): c is Candidate & { pageStart: number } => c.pageStart !== null)
    .map((c) => ({ pageStart: c.pageStart }));
}
