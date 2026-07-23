"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch, requireOk } from "@/lib/api-client";

/**
 * 请求注销账户:POST /me/deletion 进入冷静期(账户随即被后端冻结)。成功后刷新 me 并跳
 * 「恢复账户」页——期间只能撤销或退出。真正的硬删除到期由 worker 执行。
 */
export function useRequestAccountDeletion() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await requireOk(await apiFetch("/me/deletion", { method: "POST" }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/restore");
    },
  });
}

/**
 * 撤销注销:DELETE /me/deletion 退出冷静期,账户恢复正常。成功后刷新 me 并回工作台。
 */
export function useCancelAccountDeletion() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await requireOk(await apiFetch("/me/deletion", { method: "DELETE" }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/documents");
    },
  });
}
