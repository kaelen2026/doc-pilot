import { db } from "@doc-pilot/database";
import { memberships as membershipsTable, workspaces } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";

/**
 * 当前用户信息 + 其所属 workspace。仅返回调用者自己的数据（租户隔离）。
 */
export function createMeRoutes() {
  return new Hono<AppEnv>().get("/", async (c) => {
    const user = c.get("user");
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        role: membershipsTable.role,
      })
      .from(membershipsTable)
      .innerJoin(workspaces, eq(membershipsTable.workspaceId, workspaces.id))
      .where(eq(membershipsTable.userId, user.id));

    return c.json({ user, workspaces: rows });
  });
}
