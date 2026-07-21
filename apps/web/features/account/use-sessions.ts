"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

/** 登录会话(取 better-auth listSessions 里用户中心用到的字段)。 */
export interface AuthSession {
  id: string;
  token: string;
  userAgent: string | null;
  createdAt: string;
}

async function fetchSessions(): Promise<AuthSession[]> {
  const { data, error } = await authClient.listSessions();
  if (error) {
    throw new Error(error.message ?? "无法加载登录设备");
  }
  return (data ?? []).map((s) => ({
    id: s.id,
    token: s.token,
    userAgent: s.userAgent ?? null,
    createdAt: typeof s.createdAt === "string" ? s.createdAt : s.createdAt.toISOString(),
  }));
}

/** 当前用户的活跃登录会话列表。仅在会话存在时启用。 */
export function useSessions(enabled: boolean) {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
    enabled,
  });
}

/** 吊销单个会话(按 token);成功后刷新列表。 */
export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { error } = await authClient.revokeSession({ token });
      if (error) {
        throw new Error(error.message ?? "退出该设备失败");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

/** 登出除本机外的所有会话;成功后刷新列表。 */
export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) {
        throw new Error(error.message ?? "登出其它设备失败");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
}
