/** 检索与回答指标的纯函数(口径见 evals/README.md),便于单测。 */

export interface RankedPage {
  /** 候选按相似度降序排列后的页码(chunk.pageStart)。 */
  pageStart: number;
}

/** Recall@k:top-k 候选的页码集合覆盖期望页码的比例。 */
export function recallAtK(candidates: RankedPage[], expectedPages: number[], k: number): number {
  if (expectedPages.length === 0) {
    return 0;
  }
  const topPages = new Set(candidates.slice(0, k).map((c) => c.pageStart));
  const hit = expectedPages.filter((p) => topPages.has(p)).length;
  return hit / expectedPages.length;
}

/** MRR 单例项:第一个命中期望页码的候选排名的倒数;全未命中为 0。 */
export function reciprocalRank(candidates: RankedPage[], expectedPages: number[]): number {
  const expected = new Set(expectedPages);
  const index = candidates.findIndex((c) => expected.has(c.pageStart));
  return index >= 0 ? 1 / (index + 1) : 0;
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface CaseRetrievalMetrics {
  caseId: string;
  recallAt5: number;
  recallAt10: number;
  reciprocalRank: number;
}

export interface CaseAnswerMetrics {
  caseId: string;
  shouldAnswer: boolean;
  refused: boolean;
  /** 模型声称的引用数与通过业务校验的引用数。 */
  citationsClaimed: number;
  citationsValid: number;
  /** LLM Judge 打分(0~5),mock 模式为 null。 */
  correctness: number | null;
  faithfulness: number | null;
  relevance: number | null;
}

export interface AggregateReport {
  retrieval: { cases: number; recallAt5: number; recallAt10: number; mrr: number };
  answer: {
    cases: number;
    refusalAccuracy: number;
    citationAccuracy: number | null;
    correctness: number | null;
    faithfulness: number | null;
    relevance: number | null;
  } | null;
}

export function aggregate(
  retrieval: CaseRetrievalMetrics[],
  answers: CaseAnswerMetrics[],
): AggregateReport {
  const report: AggregateReport = {
    retrieval: {
      cases: retrieval.length,
      recallAt5: mean(retrieval.map((r) => r.recallAt5)),
      recallAt10: mean(retrieval.map((r) => r.recallAt10)),
      mrr: mean(retrieval.map((r) => r.reciprocalRank)),
    },
    answer: null,
  };
  if (answers.length === 0) {
    return report;
  }

  // Refusal Accuracy:该拒的拒了 + 不该拒的没拒,两类合并按用例平均。
  const refusalCorrect = answers.filter((a) => a.refused === !a.shouldAnswer).length;

  const claimed = answers.reduce((sum, a) => sum + a.citationsClaimed, 0);
  const valid = answers.reduce((sum, a) => sum + a.citationsValid, 0);

  const judged = answers.filter((a) => a.correctness !== null);
  const judgeMean = (pick: (a: CaseAnswerMetrics) => number | null) =>
    judged.length === 0 ? null : mean(judged.map((a) => pick(a) ?? 0));

  report.answer = {
    cases: answers.length,
    refusalAccuracy: refusalCorrect / answers.length,
    citationAccuracy: claimed === 0 ? null : valid / claimed,
    correctness: judgeMean((a) => a.correctness),
    faithfulness: judgeMean((a) => a.faithfulness),
    relevance: judgeMean((a) => a.relevance),
  };
  return report;
}
