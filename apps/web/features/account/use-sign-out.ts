"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * 退出登录:清 better-auth 会话 + 清 react-query 缓存(避免下个账号看到上个账号的数据),
 * 再回首页。原先内联在 documents-view,抽到此处供头部菜单与文档页共用。
 */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await authClient.signOut();
    queryClient.clear();
    router.replace("/");
  }, [router, queryClient]);
}
