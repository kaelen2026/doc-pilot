"use client";

import { SEARCH } from "@doc-pilot/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { SearchResult } from "./types";
import { useDebouncedValue } from "./use-debounced-value";

async function fetchSearch(query: string): Promise<SearchResult[]> {
  const r = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}`);
  }
  const j = (await r.json()) as { results: SearchResult[] };
  return j.results;
}

/**
 * 全局搜索。查询先 debounce(SEARCH.debounceMs)再触发,且仅在长度达标(SEARCH.minQueryLength)
 * 时启用——两者共同省下每次按键的 embedding 调用。返回 react-query 结果 + 派生的 enabled/query。
 */
export function useSearch(rawQuery: string) {
  const query = useDebouncedValue(rawQuery.trim(), SEARCH.debounceMs);
  const enabled = query.length >= SEARCH.minQueryLength;
  const result = useQuery({
    queryKey: ["search", query],
    queryFn: () => fetchSearch(query),
    enabled,
  });
  return { ...result, query, enabled };
}
