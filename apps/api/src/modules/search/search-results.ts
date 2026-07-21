import { SEARCH } from "@doc-pilot/contracts";
import { apiEnv } from "../../env";

/** 一条向量召回候选:chunk 内容 + 其归属文档标题 + 余弦相似度。 */
export interface SearchCandidate {
  documentId: string;
  title: string;
  chunkId: string;
  content: string;
  contentHash: string;
  pageStart: number | null;
  pageEnd: number | null;
  /** 余弦相似度 [0,1](1 - cosineDistance)。 */
  score: number;
}

export interface SearchPassage {
  chunkId: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  score: number;
}

/** 一个文档的搜索结果:命中片段按分降序,文档分 = 最高片段分。 */
export interface SearchResultGroup {
  documentId: string;
  title: string;
  score: number;
  passages: SearchPassage[];
}

/**
 * 把跨文档的向量候选归并为「按文档分组」的搜索结果(与 retrieval.ts 的 selectSources 同范式:
 * 纯选择/映射,不连数据库,便于单测)。流程:
 * 相似度过滤 → contentHash 去重 → 按文档分组(每组 top-N 片段)→ 文档按最高分降序 → 截断到上限。
 * 依赖候选已按分数降序传入(仓库 orderBy 保证),故遇到低于 minScore 即可提前收尾。
 */
export function groupResults(
  candidates: SearchCandidate[],
  options: { minScore?: number; maxResults?: number; maxPassagesPerDoc?: number } = {},
): SearchResultGroup[] {
  const minScore = options.minScore ?? apiEnv.ragMinScore;
  const maxResults = options.maxResults ?? SEARCH.maxResults;
  const maxPassagesPerDoc = options.maxPassagesPerDoc ?? SEARCH.maxPassagesPerDoc;

  const byDoc = new Map<string, SearchResultGroup>();
  const order: string[] = [];
  const seenHash = new Set<string>();

  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    if (c.score < minScore) {
      break; // 已按分降序,后面只会更低。
    }
    if (seenHash.has(c.contentHash)) {
      continue; // 高度重复片段去重。
    }
    seenHash.add(c.contentHash);

    let group = byDoc.get(c.documentId);
    if (!group) {
      group = { documentId: c.documentId, title: c.title, score: c.score, passages: [] };
      byDoc.set(c.documentId, group);
      order.push(c.documentId);
    }
    if (group.passages.length >= maxPassagesPerDoc) {
      continue;
    }
    group.passages.push({
      chunkId: c.chunkId,
      content: c.content,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      score: c.score,
    });
  }

  return order
    .map((id) => byDoc.get(id) as SearchResultGroup)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
