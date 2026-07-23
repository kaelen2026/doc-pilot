"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, requireOk } from "@/lib/api-client";
export function useDocumentVisibility() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, visibility }: { id: string; visibility: "private" | "public" }) => {
      await requireOk(
        await apiFetch(`/documents/${id}/visibility`, { method: "PATCH", json: { visibility } }),
      );
    },
    onSuccess: async () => client.invalidateQueries({ queryKey: ["documents"] }),
  });
}
