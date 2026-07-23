import { randomBytes } from "node:crypto";
import { db } from "@doc-pilot/database";
import { memberships, userProfiles, workspaces } from "@doc-pilot/database/schema";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateProfileUsername(): string {
  const bytes = randomBytes(8);
  let suffix = "";
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length];
  return `dp_${suffix}`;
}

/**
 * 为新注册用户创建个人 workspace + owner membership（单事务）。
 * 由 Better Auth 的 user.create.after 钩子调用。
 */
export async function createPersonalWorkspace(input: {
  userId: string;
  name: string;
}): Promise<{ workspaceId: string }> {
  return db.transaction(async (tx) => {
    const [ws] = await tx
      .insert(workspaces)
      .values({ name: input.name, type: "personal", ownerId: input.userId })
      .returning({ id: workspaces.id });

    if (!ws) {
      throw new Error("failed to create personal workspace");
    }

    await tx.insert(memberships).values({
      workspaceId: ws.id,
      userId: input.userId,
      role: "owner",
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const inserted = await tx
        .insert(userProfiles)
        .values({ userId: input.userId, username: generateProfileUsername() })
        .onConflictDoNothing()
        .returning({ userId: userProfiles.userId });
      if (inserted.length > 0) break;
      if (attempt === 4) throw new Error("failed to create public profile");
    }

    return { workspaceId: ws.id };
  });
}
