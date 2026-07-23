"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, requireOk } from "@/lib/api-client";
import { fetchPublicDocuments, fetchPublicProfile } from "./api";

export function usePublicProfile(username: string) {
  const profile = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => fetchPublicProfile(username),
  });
  const documents = useQuery({
    queryKey: ["public-documents", username],
    queryFn: () => fetchPublicDocuments(username),
  });
  return { profile, documents };
}
export function useFollowStatus(username: string, enabled: boolean) {
  return useQuery({
    queryKey: ["follow-status", username],
    queryFn: async () =>
      (
        await requireOk(await apiFetch(`/me/follows/${encodeURIComponent(username)}`))
      ).json() as Promise<{ following: boolean }>,
    enabled,
  });
}
export function useFollowMutation(username: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (following: boolean) => {
      await requireOk(
        await apiFetch(`/users/${encodeURIComponent(username)}/follow`, {
          method: following ? "DELETE" : "PUT",
        }),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["follow-status", username] }),
        client.invalidateQueries({ queryKey: ["public-profile", username] }),
      ]);
    },
  });
}
