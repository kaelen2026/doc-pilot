import { z } from "zod";

/**
 * 问答结构化输出与引用校验（ADR-007 / rag.md#19.2）。
 * 模型输出先过 AnswerSchema（Zod），再过这里的业务校验：
 * sourceId 是否存在、是否属于本次 Context、是否属于当前文档、quote 是否与原文大致匹配。
 * 全部通过才允许落库，支撑"引用 ID 有效性 100%"目标。
 */
export const AnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      sourceId: z.string(),
      quote: z.string(),
      claim: z.string(),
    }),
  ),
  insufficientEvidence: z.boolean(),
});

export type Answer = z.infer<typeof AnswerSchema>;
export type AnswerCitation = Answer["citations"][number];

/** 本次检索注入 Prompt 的一个来源，即校验的比对基准（对应 document_chunks 一行）。 */
export interface CitationSource {
  /** 注入 Prompt 时分配的 source 标识，模型引用它。 */
  sourceId: string;
  documentId: string;
  chunkId: string;
  /** chunk 原文，quote 与它做模糊匹配。 */
  text: string;
  pageStart?: number;
  pageEnd?: number;
}

export type CitationIssueCode =
  /** sourceId 不在本次 Context 中（不存在 / 不属于本次检索，rag.md 前两条合并：基准就是本次 Context）。 */
  | "UNKNOWN_SOURCE"
  /** source 存在但不属于当前文档（跨文档引用，Phase 6 验收红线）。 */
  | "WRONG_DOCUMENT"
  /** quote 与来源原文相似度低于阈值。 */
  | "QUOTE_MISMATCH"
  /** 声称证据充分但一条引用都没有。 */
  | "MISSING_CITATIONS"
  /** 声称证据不足（应拒答）却仍附带引用。 */
  | "UNEXPECTED_CITATIONS";

export interface CitationIssue {
  code: CitationIssueCode;
  /** 出问题的 citations 下标；answer 级问题（MISSING/UNEXPECTED_CITATIONS）为 -1。 */
  index: number;
  sourceId?: string;
  message: string;
}

/** 校验通过的引用，补齐了落库 citations 表需要的字段。 */
export interface ValidatedCitation {
  index: number;
  sourceId: string;
  documentId: string;
  chunkId: string;
  quote: string;
  claim: string;
  pageStart?: number;
  pageEnd?: number;
  /** quote 与原文的匹配度 [0,1]，可作 citations.score 落库。 */
  matchScore: number;
}

export interface ValidateAnswerOptions {
  /** 本次检索上下文的全部来源。 */
  sources: CitationSource[];
  /** 当前会话绑定的文档。 */
  documentId: string;
  /** quote 模糊匹配阈值，缺省 0.8。 */
  minQuoteMatch?: number;
}

export interface AnswerValidationResult {
  ok: boolean;
  citations: ValidatedCitation[];
  issues: CitationIssue[];
}

export function validateAnswer(
  answer: Answer,
  options: ValidateAnswerOptions,
): AnswerValidationResult {
  const { sources, documentId } = options;
  const minQuoteMatch = options.minQuoteMatch ?? 0.8;
  const bySourceId = new Map(sources.map((s) => [s.sourceId, s]));

  const citations: ValidatedCitation[] = [];
  const issues: CitationIssue[] = [];

  if (answer.insufficientEvidence && answer.citations.length > 0) {
    issues.push({
      code: "UNEXPECTED_CITATIONS",
      index: -1,
      message: "声称证据不足却附带引用，应显式拒答",
    });
  }
  if (!answer.insufficientEvidence && answer.citations.length === 0) {
    issues.push({
      code: "MISSING_CITATIONS",
      index: -1,
      message: "声称证据充分但没有任何引用",
    });
  }

  answer.citations.forEach((citation, index) => {
    const source = bySourceId.get(citation.sourceId);
    if (!source) {
      issues.push({
        code: "UNKNOWN_SOURCE",
        index,
        sourceId: citation.sourceId,
        message: `sourceId ${citation.sourceId} 不在本次检索上下文中`,
      });
      return;
    }
    if (source.documentId !== documentId) {
      issues.push({
        code: "WRONG_DOCUMENT",
        index,
        sourceId: citation.sourceId,
        message: `sourceId ${citation.sourceId} 属于文档 ${source.documentId}，不属于当前文档`,
      });
      return;
    }
    const matchScore = quoteMatchScore(citation.quote, source.text);
    if (matchScore < minQuoteMatch) {
      issues.push({
        code: "QUOTE_MISMATCH",
        index,
        sourceId: citation.sourceId,
        message: `quote 与来源原文匹配度 ${matchScore.toFixed(2)} 低于阈值 ${minQuoteMatch}`,
      });
      return;
    }
    citations.push({
      index,
      sourceId: citation.sourceId,
      documentId: source.documentId,
      chunkId: source.chunkId,
      quote: citation.quote,
      claim: citation.claim,
      pageStart: source.pageStart,
      pageEnd: source.pageEnd,
      matchScore,
    });
  });

  return { ok: issues.length === 0, citations, issues };
}

/**
 * quote 与来源原文的"大致匹配"度 [0,1]。
 * 归一化（去空白、统一标点、小写）后：子串命中记 1；
 * 否则用字符 bigram 包含率（quote 的 bigram 有多大比例出现在原文中），
 * 对中英文都稳健，容忍模型少量改写、省略与标点差异。
 */
export function quoteMatchScore(quote: string, sourceText: string): number {
  const q = normalize(quote);
  const s = normalize(sourceText);
  if (q.length === 0) {
    return 0;
  }
  if (s.includes(q)) {
    return 1;
  }
  if (q.length < 2) {
    return 0;
  }
  const sourceBigrams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    sourceBigrams.add(s.slice(i, i + 2));
  }
  let hit = 0;
  const total = q.length - 1;
  for (let i = 0; i < total; i++) {
    if (sourceBigrams.has(q.slice(i, i + 2))) {
      hit++;
    }
  }
  return hit / total;
}

/** 归一化：全部小写、去空白、统一中英文标点为同一形态，只保留可比较的内容字符。 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[“”"「」『』]/g, '"')
    .replace(/[‘’']/g, "'")
    .replace(/[，,]/g, ",")
    .replace(/[。.]/g, ".")
    .replace(/[；;]/g, ";")
    .replace(/[：:]/g, ":")
    .replace(/[！!]/g, "!")
    .replace(/[？?]/g, "?")
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")");
}
