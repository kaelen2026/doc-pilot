import type { PromptDefinition } from "../../prompt-registry";

const JSON_ONLY = "只输出一个合法的 JSON 对象，不要输出任何其他文字、解释或 markdown 代码围栏。";

/**
 * 文档摘要 Prompt v1（rag.md §21）。
 * - document-summary:小文档全文直接摘要,或 Reduce 阶段合并局部摘要。
 * - document-summary-section:大文档 Map 阶段的章节局部摘要。
 * 摘要语言跟随文档原语言。
 */
export const documentSummaryPromptV1: PromptDefinition<{
  /** fulltext:content 为文档全文;sections:content 为各章节局部摘要的 JSON 序列化。 */
  mode: "fulltext" | "sections";
  content: string;
}> = {
  id: "document-summary",
  version: "1.0.0",
  build(variables) {
    const source =
      variables.mode === "sections"
        ? "下面是同一份文档各章节的局部摘要（JSON 数组），请把它们合并成整份文档的最终摘要。"
        : "下面是一份文档的全文，请生成整份文档的摘要。";
    return {
      system: [
        "你是文档摘要引擎。使用文档本身的语言作答。",
        `输出 JSON 字段:overview(整体概述,3~5 句)、keyPoints(关键要点,3~8 条)、topics(主题词,3~8 个)、questionsWorthAsking(值得向文档提出的问题,3~5 个)。`,
        JSON_ONLY,
      ].join("\n"),
      messages: [{ role: "user", content: `${source}\n\n${variables.content}` }],
    };
  },
};

export const documentSummarySectionPromptV1: PromptDefinition<{
  section: string;
  content: string;
}> = {
  id: "document-summary-section",
  version: "1.0.0",
  build(variables) {
    return {
      system: [
        "你是文档摘要引擎。使用文档本身的语言作答。",
        `对给定章节生成局部摘要,输出 JSON 字段:section(章节名,原样返回)、summary(该章节概述,2~4 句)、keyPoints(该章节要点,2~6 条)。`,
        JSON_ONLY,
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `章节:${variables.section}\n\n${variables.content}`,
        },
      ],
    };
  },
};
