"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Me } from "./types";

async function fetchMe(): Promise<Me> {
  const r = await apiFetch(`/me`);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}`);
  }
  return (await r.json()) as Me;
}

/** 当前用户 + 所属 workspaces(GET /me)。仅在会话存在时启用。 */
export function useMe(enabled: boolean) {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled,
  });
}
