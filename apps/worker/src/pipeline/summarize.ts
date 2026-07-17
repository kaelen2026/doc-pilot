import {
  type AIGateway,
  type AIMetadata,
  type DocumentSummary,
  DocumentSummarySchema,
  type SectionSummary,
  SectionSummarySchema,
} from "@doc-pilot/ai";
import type { Chunk } from "./types";

export interface SummarizeInput {
  gateway: AIGateway;
  /** 本次处理产出的全部 Chunk(按 chunkIndex 有序)。 */
  chunks: Chunk[];
  metadata: AIMetadata;
  /** 全文 token 不超过该值时整篇直接摘要,否则 Map-Reduce(rag.md §21)。 */
  smallDocTokenThreshold?: number;
  /** Map 阶段单个分组的 token 预算。 */
  sectionTokenBudget?: number;
}

interface SectionGroup {
  section: string;
  content: string;
  tokenCount: number;
}

/**
 * 文档摘要 stage(rag.md §21):
 * - 小文档:全文一次生成最终摘要;
 * - 大文档:按章节(sectionPath 首段)分组做局部摘要,再合并成最终摘要。
 * Map 阶段串行执行:摘要是后台任务,吞吐让位于可预测的限流表现。
 */
export async function summarizeDocument(input: SummarizeInput): Promise<DocumentSummary> {
  const threshold =
    input.smallDocTokenThreshold ?? Number(process.env.AI_SUMMARY_SMALL_DOC_TOKENS ?? 12000);
  const totalTokens = input.chunks.reduce((sum, c) => sum + c.tokenCount, 0);

  if (totalTokens <= threshold) {
    const content = input.chunks.map((c) => c.content).join("\n\n");
    return generateFinal(input, { mode: "fulltext", content });
  }

  const budget = input.sectionTokenBudget ?? Number(process.env.AI_SUMMARY_SECTION_TOKENS ?? 6000);
  const groups = groupBySections(input.chunks, budget);

  const sectionSummaries: SectionSummary[] = [];
  for (const group of groups) {
    const result = await input.gateway.generateObject({
      capability: "summarize",
      promptId: "document-summary-section",
      promptVersion: "1.0.0",
      schema: SectionSummarySchema,
      variables: { section: group.section, content: group.content },
      metadata: input.metadata,
    });
    sectionSummaries.push(result.data);
  }

  return generateFinal(input, {
    mode: "sections",
    content: JSON.stringify(sectionSummaries, null, 2),
  });
}

async function generateFinal(
  input: SummarizeInput,
  variables: { mode: "fulltext" | "sections"; content: string },
): Promise<DocumentSummary> {
  const result = await input.gateway.generateObject({
    capability: "summarize",
    promptId: "document-summary",
    promptVersion: "1.0.0",
    schema: DocumentSummarySchema,
    variables,
    metadata: input.metadata,
  });
  return result.data;
}

/**
 * 按 sectionPath 首段把相邻 Chunk 聚成组;无章节信息的落入"正文"组。
 * 单组超出 token 预算就切开(组名不要求唯一,Reduce 阶段按数组合并)。
 */
export function groupBySections(chunks: Chunk[], tokenBudget: number): SectionGroup[] {
  const groups: SectionGroup[] = [];
  let current: SectionGroup | null = null;
  let currentKey: string | null = null;

  for (const chunk of chunks) {
    const key = chunk.sectionPath[0] ?? "正文";
    const fits =
      current !== null &&
      currentKey === key &&
      current.tokenCount + chunk.tokenCount <= tokenBudget;

    if (fits && current) {
      current.content += `\n\n${chunk.content}`;
      current.tokenCount += chunk.tokenCount;
    } else {
      current = { section: key, content: chunk.content, tokenCount: chunk.tokenCount };
      currentKey = key;
      groups.push(current);
    }
  }
  return groups;
}
