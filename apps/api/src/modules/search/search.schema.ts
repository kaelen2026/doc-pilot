import { SEARCH } from "@doc-pilot/contracts";
import { ValidationError } from "../../shared/errors";

export interface SearchQueryInput {
  query: string;
}

/**
 * 解析并校验搜索查询词(来自 `?q=`)。trim 后长度不足即抛 ValidationError。
 * 前端 debounce + 最小长度是第一道闸,这里是服务端防御。
 */
export function parseSearchQuery(raw: unknown): SearchQueryInput {
  if (typeof raw !== "string") {
    throw new ValidationError("query is required");
  }
  const query = raw.trim();
  if (query.length < SEARCH.minQueryLength) {
    throw new ValidationError(`query must be at least ${SEARCH.minQueryLength} characters`);
  }
  return { query };
}
