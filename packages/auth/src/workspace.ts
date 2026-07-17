import { db } from "@doc-pilot/database";
import { memberships, workspaces } from "@doc-pilot/database/schema";

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

    return { workspaceId: ws.id };
  });
}
