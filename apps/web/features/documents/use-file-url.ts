"use client";

import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/lib/env";

async function fetchFileUrl(documentId: string): Promise<string> {
  const r = await fetch(`${API_URL}/documents/${documentId}/file-url`, {
    credentials: "include",
  });
  if (!r.ok) {
    throw new Error(r.status === 404 ? "文档不存在或尚未上传" : `HTTP ${r.status}`);
  }
  const { url } = (await r.json()) as { url: string; expiresAt: string };
  return url;
}

/**
 * 原始 PDF 的预签名 GET URL。URL 有时效(默认 15min),故不长缓存:
 * staleTime 设短,重新进入阅读器时刷新,避免拿到过期链接。
 */
export function useFileUrl(documentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["document-file-url", documentId],
    queryFn: () => fetchFileUrl(documentId),
    enabled,
    staleTime: 10 * 60 * 1000, // 10min < 15min 有效期
    gcTime: 10 * 60 * 1000,
  });
}
