import { db } from "@doc-pilot/database";
import { documents, user, userFollows, userProfiles } from "@doc-pilot/database/schema";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { ProfileUpdateInput } from "./profile.schema";

const publicProfileFields = {
  username: userProfiles.username,
  name: user.name,
  image: user.image,
  bio: userProfiles.bio,
  location: userProfiles.location,
  websiteUrl: userProfiles.websiteUrl,
  socialLinks: userProfiles.socialLinks,
  createdAt: userProfiles.createdAt,
};

export async function findPublicProfile(username: string) {
  const [profile] = await db
    .select(publicProfileFields)
    .from(userProfiles)
    .innerJoin(user, eq(userProfiles.userId, user.id))
    .where(eq(userProfiles.username, username))
    .limit(1);
  if (!profile) return undefined;
  const [owner] = await db
    .select({ id: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.username, username));
  if (!owner) return undefined;
  const [[followers], [following], [publicDocuments]] = await Promise.all([
    db.select({ value: count() }).from(userFollows).where(eq(userFollows.followingId, owner.id)),
    db.select({ value: count() }).from(userFollows).where(eq(userFollows.followerId, owner.id)),
    db
      .select({ value: count() })
      .from(documents)
      .where(
        and(
          eq(documents.ownerId, owner.id),
          eq(documents.visibility, "public"),
          inArray(documents.status, ["ready", "partially_ready"]),
          isNull(documents.deletedAt),
        ),
      ),
  ]);
  return {
    ...profile,
    followerCount: followers?.value ?? 0,
    followingCount: following?.value ?? 0,
    publicDocumentCount: publicDocuments?.value ?? 0,
  };
}

export async function listPublicProfileDocuments(username: string) {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      pageCount: documents.pageCount,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .innerJoin(userProfiles, eq(documents.ownerId, userProfiles.userId))
    .where(
      and(
        eq(userProfiles.username, username),
        eq(documents.visibility, "public"),
        inArray(documents.status, ["ready", "partially_ready"]),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(50);
}

export async function listFollowUsers(username: string, direction: "followers" | "following") {
  const target = alias(userProfiles, "target_profile");
  const targetUser = alias(user, "target_user");
  const ownerColumn = direction === "followers" ? userFollows.followingId : userFollows.followerId;
  const listedColumn = direction === "followers" ? userFollows.followerId : userFollows.followingId;
  return db
    .select({
      username: target.username,
      name: targetUser.name,
      image: targetUser.image,
      bio: target.bio,
    })
    .from(userFollows)
    .innerJoin(userProfiles, eq(ownerColumn, userProfiles.userId))
    .innerJoin(target, eq(listedColumn, target.userId))
    .innerJoin(targetUser, eq(target.userId, targetUser.id))
    .where(eq(userProfiles.username, username))
    .orderBy(desc(userFollows.createdAt))
    .limit(50);
}

export async function updateProfile(userId: string, input: ProfileUpdateInput) {
  return db.transaction(async (tx) => {
    if (input.name !== undefined || input.image !== undefined) {
      await tx
        .update(user)
        .set({ name: input.name, image: input.image, updatedAt: new Date() })
        .where(eq(user.id, userId));
    }
    const profileValues = {
      bio: input.bio,
      location: input.location,
      websiteUrl: input.websiteUrl,
      socialLinks: input.socialLinks,
      updatedAt: new Date(),
    };
    const [profile] = await tx
      .update(userProfiles)
      .set(profileValues)
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  });
}

export async function followByUsername(followerId: string, username: string) {
  const [target] = await db
    .select({ id: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.username, username))
    .limit(1);
  if (!target) return "not_found" as const;
  if (target.id === followerId) return "self" as const;
  await db.insert(userFollows).values({ followerId, followingId: target.id }).onConflictDoNothing();
  return "ok" as const;
}

export async function unfollowByUsername(followerId: string, username: string) {
  const [target] = await db
    .select({ id: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.username, username))
    .limit(1);
  if (!target) return false;
  await db
    .delete(userFollows)
    .where(and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, target.id)));
  return true;
}

export async function isFollowing(followerId: string, username: string) {
  const [row] = await db
    .select({ followingId: userFollows.followingId })
    .from(userFollows)
    .innerJoin(userProfiles, eq(userFollows.followingId, userProfiles.userId))
    .where(and(eq(userFollows.followerId, followerId), eq(userProfiles.username, username)))
    .limit(1);
  return Boolean(row);
}
