import { auth } from "@doc-pilot/auth";
import { db } from "@doc-pilot/database";
import { memberships as membershipsTable } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import type { MembershipLoader, SessionGetter } from "../middleware/auth.middleware";

/**
 * 生产实现：从 Better Auth 解析会话，从数据库加载 membership。
 * 单测里用假的替身替换（见 auth.middleware.test.ts）。
 */
export const getSession: SessionGetter = async (headers) => {
  const s = await auth.api.getSession({ headers });
  if (!s) {
    return null;
  }
  return { user: { id: s.user.id, email: s.user.email, name: s.user.name } };
};

export const loadMemberships: MembershipLoader = async (userId) => {
  return db
    .select({ workspaceId: membershipsTable.workspaceId, role: membershipsTable.role })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, userId));
};
