"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, requireOk } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

/**
 * 更新个人资料(目前仅昵称)。走 better-auth 的 updateUser,
 * 成功后失效 me 查询并让 better-auth 刷新会话,使头部/页面即时反映新昵称。
 */
export function useUpdateName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await authClient.updateUser({ name });
      if (error) {
        throw new Error(error.message ?? "更新失败");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      // 会话里也缓存了 user.name(头部头像/菜单读它),刷新以保持一致。
      await authClient.getSession({ query: { disableCookieCache: true } });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      image: string | null;
      bio: string | null;
      location: string | null;
      websiteUrl: string | null;
      socialLinks: Record<string, string>;
    }) => {
      await requireOk(await apiFetch("/me/profile", { method: "PATCH", json: input }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await authClient.getSession({ query: { disableCookieCache: true } });
    },
  });
}
