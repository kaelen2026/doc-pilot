"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Usage } from "./types";

async function fetchUsage(): Promise<Usage> {
  const r = await apiFetch(`/me/usage`);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}`);
  }
  const j = (await r.json()) as { usage: Usage };
  return j.usage;
}

/** 当前 workspace 各维度配额用量(GET /me/usage)。仅在会话存在时启用。 */
export function useUsage(enabled: boolean) {
  return useQuery({
    queryKey: ["me", "usage"],
    queryFn: fetchUsage,
    enabled,
  });
}
