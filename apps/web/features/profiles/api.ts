import { apiFetch, requireOk } from "@/lib/api-client";
import type { FollowUser, PublicDocument, PublicProfile } from "./types";

export async function fetchPublicProfile(username: string): Promise<PublicProfile> {
  const r = await requireOk(await apiFetch(`/public/profiles/${encodeURIComponent(username)}`));
  return ((await r.json()) as { profile: PublicProfile }).profile;
}
export async function fetchPublicDocuments(username: string): Promise<PublicDocument[]> {
  const r = await requireOk(
    await apiFetch(`/public/profiles/${encodeURIComponent(username)}/documents`),
  );
  return ((await r.json()) as { documents: PublicDocument[] }).documents;
}
export async function fetchFollowUsers(
  username: string,
  direction: "followers" | "following",
): Promise<FollowUser[]> {
  const r = await requireOk(
    await apiFetch(`/public/profiles/${encodeURIComponent(username)}/${direction}`),
  );
  return ((await r.json()) as { users: FollowUser[] }).users;
}
