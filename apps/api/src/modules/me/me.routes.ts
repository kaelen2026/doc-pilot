import { db } from "@doc-pilot/database";
import {
  memberships as membershipsTable,
  userProfiles,
  workspaces,
} from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { isAdminEmail } from "../../shared/admin";
import type { AppEnv } from "../../shared/types";
import { activeWorkspaceId } from "../../shared/workspace";
import { getUsage } from "../quota/quota.service";

/**
 * 当前用户信息 + 其所属 workspace。仅返回调用者自己的数据（租户隔离）。
 */
export function createMeRoutes() {
  return (
    new Hono<AppEnv>()
      .get("/", async (c) => {
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

        const [profile] = await db
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.userId, user.id))
          .limit(1);

        // isAdmin 供前端门禁 /admin(真正的授权仍在 API 的 requireAdmin,前端只是 UX)。
        return c.json({ user, profile, workspaces: rows, isAdmin: isAdminEmail(user.email) });
      })
      // 当前 workspace 的配额用量 vs 上限,供前端展示(cross-cutting.md §27.2)。
      .get("/usage", async (c) => {
        const workspaceId = activeWorkspaceId(c.get("memberships"));
        const usage = await getUsage(workspaceId);
        return c.json({ usage });
      })
  );
}
