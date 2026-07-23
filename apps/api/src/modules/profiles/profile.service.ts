import { DomainError, NotFoundError } from "../../shared/errors";
import {
  findPublicProfile,
  followByUsername,
  isFollowing,
  listFollowUsers,
  listPublicProfileDocuments,
  unfollowByUsername,
  updateProfile,
} from "./profile.repository";
import type { ProfileUpdateInput } from "./profile.schema";

export async function getPublicProfile(username: string) {
  const profile = await findPublicProfile(username);
  if (!profile) throw new NotFoundError("profile not found");
  return profile;
}
export async function getPublicDocuments(username: string) {
  await getPublicProfile(username);
  return listPublicProfileDocuments(username);
}
export async function getFollowUsers(username: string, direction: "followers" | "following") {
  await getPublicProfile(username);
  return listFollowUsers(username, direction);
}
export async function saveProfile(userId: string, input: ProfileUpdateInput) {
  return updateProfile(userId, input);
}
export async function followUser(userId: string, username: string) {
  const result = await followByUsername(userId, username);
  if (result === "not_found") throw new NotFoundError("profile not found");
  if (result === "self")
    throw new DomainError("SELF_FOLLOW_NOT_ALLOWED", "cannot follow yourself", 400);
}
export async function unfollowUser(userId: string, username: string) {
  if (!(await unfollowByUsername(userId, username))) throw new NotFoundError("profile not found");
}
export async function getFollowStatus(userId: string, username: string) {
  await getPublicProfile(username);
  return { following: await isFollowing(userId, username) };
}
