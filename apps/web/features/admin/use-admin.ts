"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  AdminOverview,
  AdminUsageReport,
  AdminUser,
  AdminWorkspace,
  TestPushReport,
} from "./types";

async function get<T>(path: string): Promise<T> {
  const r = await apiFetch(path);
  if (!r.ok) {
    throw new Error(await errorMessage(r));
  }
  return (await r.json()) as T;
}

/** 平台总览统计(GET /admin/overview)。仅平台管理员启用。 */
export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => get<AdminOverview>("/admin/overview"),
    enabled,
  });
}

/** 用量与成本报表(GET /admin/usage?days=)。 */
export function useAdminUsage(enabled: boolean, days: number) {
  return useQuery({
    queryKey: ["admin", "usage", days],
    queryFn: () => get<AdminUsageReport>(`/admin/usage?days=${days}`),
    enabled,
  });
}

/** 全量 workspace 列表(GET /admin/workspaces)。 */
export function useAdminWorkspaces(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "workspaces"],
    queryFn: () => get<{ workspaces: AdminWorkspace[] }>("/admin/workspaces"),
    enabled,
  });
}

/** 全量用户列表(GET /admin/users)。 */
export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => get<{ users: AdminUser[] }>("/admin/users"),
    enabled,
  });
}

export interface SendTestPushInput {
  email: string;
  title?: string;
  body?: string;
}

/** 发送测试推送(POST /admin/push-test)。真实投递,不缓存,故用 mutation。 */
export function useSendTestPush() {
  return useMutation({
    mutationFn: async (input: SendTestPushInput): Promise<TestPushReport> => {
      const r = await apiFetch("/admin/push-test", { method: "POST", json: input });
      if (!r.ok) {
        throw new Error(await errorMessage(r));
      }
      return (await r.json()) as TestPushReport;
    },
  });
}
