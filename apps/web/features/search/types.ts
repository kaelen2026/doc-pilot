/** 全局搜索结果 DTO,形状与 API `/search` 返回一致(apps/api search-results.ts)。 */

export interface SearchPassage {
  chunkId: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  score: number;
}

export interface SearchResult {
  documentId: string;
  title: string;
  /** 文档分 = 最高片段分。 */
  score: number;
  passages: SearchPassage[];
}
