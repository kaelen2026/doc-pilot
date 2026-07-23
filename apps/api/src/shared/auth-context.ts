import { auth } from "@doc-pilot/auth";
import { db } from "@doc-pilot/database";
import { memberships as membershipsTable, user } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import type { AccountContextLoader, SessionGetter } from "../middleware/auth.middleware";

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

/**
 * 一次查询取回账户上下文:所属 membership + 账户注销冷静期状态。
 * 从 user 出发 LEFT JOIN memberships——保证即使无 membership 也能拿到 deletionScheduledAt,
 * 且把冻结判定所需的这一列与 membership 折进同一次往返,免去 requireActiveAccount 的额外 PK 查询。
 */
export const loadAccountContext: AccountContextLoader = async (userId) => {
  const rows = await db
    .select({
      workspaceId: membershipsTable.workspaceId,
      role: membershipsTable.role,
      deletionScheduledAt: user.deletionScheduledAt,
    })
    .from(user)
    .leftJoin(membershipsTable, eq(membershipsTable.userId, user.id))
    .where(eq(user.id, userId));

  const memberships = rows
    .filter((r) => r.workspaceId !== null)
    .map((r) => ({ workspaceId: r.workspaceId as string, role: r.role as string }));
  return { memberships, deletionScheduledAt: rows[0]?.deletionScheduledAt ?? null };
};
