import { z } from "zod";

/** Map 阶段：单个章节的局部摘要（rag.md §21.2）。 */
export const SectionSummarySchema = z.object({
  section: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
});

export type SectionSummary = z.infer<typeof SectionSummarySchema>;

/** 最终摘要，写入 documents.summary JSONB（rag.md §21.2、data-model.md §8.2）。 */
export const DocumentSummarySchema = z.object({
  overview: z.string(),
  keyPoints: z.array(z.string()),
  topics: z.array(z.string()),
  questionsWorthAsking: z.array(z.string()),
});

export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;
