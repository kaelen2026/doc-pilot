import type { CitationSource, PromptDefinition } from "@doc-pilot/ai";
import { z } from "zod";

/**
 * LLM Judge(testing-and-eval.md §31.2):对回答按三个维度打 0~5 分。
 * - Correctness:是否覆盖 expectedPoints 的关键结论,无事实错误。
 * - Faithfulness:每个断言是否都能在给定来源中找到依据(不看外部知识)。
 * - Answer Relevance:是否正面回答了所问的问题。
 */
export const JudgeSchema = z.object({
  correctness: z.number().min(0).max(5),
  faithfulness: z.number().min(0).max(5),
  relevance: z.number().min(0).max(5),
  rationale: z.string(),
});
export type JudgeVerdict = z.infer<typeof JudgeSchema>;

export type JudgeVariables = {
  question: string;
  expectedPoints: string[];
  sources: CitationSource[];
  answer: string;
};

export const judgePromptV1: PromptDefinition<JudgeVariables> = {
  id: "eval-judge",
  version: "1.0.0",
  build(v) {
    const sources = v.sources.map((s) => `[${s.sourceId}] ${s.text}`).join("\n\n");
    return {
      system: [
        "你是严格的评审,对一个文档问答系统的回答打分。只依据给定来源判断,不使用外部知识。",
        "输出 JSON 字段:correctness、faithfulness、relevance(均为 0~5 的数字)、rationale(一句话理由)。",
        "- correctness:回答是否覆盖期望要点且无事实错误。要点齐全给 5,缺关键要点按比例扣。",
        "- faithfulness:回答的每个断言是否都能在来源中找到依据。任何一处编造都不高于 2。",
        "- relevance:是否正面回答所问问题,答非所问给低分。",
        "只输出一个合法的 JSON 对象,不要输出任何其他文字或代码围栏。",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            `问题:${v.question}`,
            `期望要点:${v.expectedPoints.length > 0 ? v.expectedPoints.join(";") : "(无)"}`,
            `来源:\n${sources}`,
            `待评回答:\n${v.answer}`,
          ].join("\n\n"),
        },
      ],
    };
  },
};
