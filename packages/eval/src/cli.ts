import { writeFileSync } from "node:fs";
import { queryClient } from "@doc-pilot/database";
import { loadDataset } from "./dataset";
import { evalEnv } from "./env";
import { evalGateway } from "./gateway";
import { aggregate, type CaseAnswerMetrics, type CaseRetrievalMetrics } from "./metrics";
import { ingestDataset, runCase } from "./runner";

/**
 * Eval runner(testing-and-eval.md §31)。
 * EVAL_MODE=retrieval(缺省):只算检索指标,embedding 可 mock,CI 可跑。
 * EVAL_MODE=full:真实模型跑完整回答链路 + LLM Judge,发布新 Prompt/模型前必须跑。
 */
const mode = evalEnv.mode;
const dataset = loadDataset(evalEnv.evalsDir);
console.log(
  `[eval] mode=${mode} documents=${dataset.documents.size} cases=${dataset.cases.length}`,
);

const gateway = evalGateway(mode);
const fixture = await ingestDataset(gateway, dataset);

try {
  const retrieval: CaseRetrievalMetrics[] = [];
  const answers: CaseAnswerMetrics[] = [];
  for (const evalCase of dataset.cases) {
    const result = await runCase(gateway, fixture, evalCase, mode);
    if (result.retrieval) {
      retrieval.push(result.retrieval);
      console.log(
        `  ${evalCase.caseId}  R@5=${fmt(result.retrieval.recallAt5)}  R@10=${fmt(result.retrieval.recallAt10)}  RR=${fmt(result.retrieval.reciprocalRank)}`,
      );
    }
    if (result.answer) {
      const a = result.answer;
      console.log(
        `  ${evalCase.caseId}  refused=${a.refused}(expect ${!a.shouldAnswer})  citations=${a.citationsValid}/${a.citationsClaimed}${a.correctness !== null ? `  C=${a.correctness} F=${a.faithfulness} R=${a.relevance}` : ""}`,
      );
      answers.push(a);
    }
  }

  const report = aggregate(retrieval, answers);
  console.log("\n=== Evaluation Report ===");
  console.log(
    `检索(${report.retrieval.cases} cases):Recall@5=${fmt(report.retrieval.recallAt5)}  Recall@10=${fmt(report.retrieval.recallAt10)}  MRR=${fmt(report.retrieval.mrr)}`,
  );
  if (report.answer) {
    const a = report.answer;
    console.log(
      `回答(${a.cases} cases):RefusalAcc=${fmt(a.refusalAccuracy)}  CitationAcc=${a.citationAccuracy === null ? "n/a" : fmt(a.citationAccuracy)}` +
        (a.correctness === null
          ? ""
          : `  Correctness=${fmt(a.correctness, 2)}/5  Faithfulness=${fmt(a.faithfulness ?? 0, 2)}/5  Relevance=${fmt(a.relevance ?? 0, 2)}/5`),
    );
  }

  if (evalEnv.reportPath) {
    writeFileSync(
      evalEnv.reportPath,
      JSON.stringify({ mode, generatedAt: new Date().toISOString(), report }, null, 2),
    );
    console.log(`[eval] 报告已写入 ${evalEnv.reportPath}`);
  }
} finally {
  await fixture.cleanup();
  await queryClient.end();
}

function fmt(value: number, digits = 3): string {
  return value.toFixed(digits);
}
