"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface DocItem {
  id: string;
  title: string;
  status: string;
  visibility: "private" | "public";
  currentStage: string | null;
  progress: number;
  pageCount: number | null;
  sizeBytes: number;
  errorCode: string | null;
  createdAt: string;
}

// 处理中的文档需要轮询，直到进入终态。
const IN_FLIGHT = new Set(["queued", "processing", "deleting"]);

async function fetchDocuments(): Promise<DocItem[]> {
  const r = await apiFetch(`/documents`);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}`);
  }
  const j = (await r.json()) as { documents: DocItem[] };
  return j.documents;
}

/**
 * 文档列表。仅在会话存在时启用；只要还有在途文档就每 2s 轮询一次，
 * 全部进入终态后自动停轮询——原来手写的 useEffect + 递归 setTimeout 由此收敛。
 */
export function useDocuments(enabled: boolean) {
  return useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
    enabled,
    refetchInterval: (query) =>
      query.state.data?.some((d) => IN_FLIGHT.has(d.status)) ? 2000 : false,
  });
}
