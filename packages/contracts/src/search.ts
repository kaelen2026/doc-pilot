/**
 * 全局搜索契约:跨工作区语义内容搜索的上限与前端节流参数。
 * Web / API 双方引用,避免上限魔法数在前后端静默漂移。
 */
export const SEARCH = {
  /** 触发搜索的最小查询长度(字符,trim 后)。 */
  minQueryLength: 2,
  /** 向量召回候选 chunk 数上限(送进分组前)。 */
  candidateLimit: 50,
  /** 返回的文档结果数上限。 */
  maxResults: 20,
  /** 每个文档保留的命中片段数上限。 */
  maxPassagesPerDoc: 3,
  /** 前端输入防抖(毫秒),省下无谓的 embedding 调用。 */
  debounceMs: 250,
} as const;
