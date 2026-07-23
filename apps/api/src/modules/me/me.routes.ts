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
import { cancelAccountDeletion, requestAccountDeletion } from "./me.service";

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

        // deletionScheduledAt 非空表示账户处于注销冷静期;前端据此把用户冻结重定向到恢复页。
        // 复用 requireAuth 已随 membership 载入的值,不再另查一次(见 loadAccountContext)。
        const deletionScheduledAt = c.get("accountDeletionScheduledAt");
        // isAdmin 供前端门禁 /admin(真正的授权仍在 API 的 requireAdmin,前端只是 UX)。
        return c.json({
          user,
          profile,
          workspaces: rows,
          isAdmin: isAdminEmail(user.email),
          deletionScheduledAt,
        });
      })
      // 当前 workspace 的配额用量 vs 上限,供前端展示(cross-cutting.md §27.2)。
      .get("/usage", async (c) => {
        const workspaceId = activeWorkspaceId(c.get("memberships"));
        const usage = await getUsage(workspaceId);
        return c.json({ usage });
      })
      // 请求注销账户:进入冷静期(账户随即被 requireActiveAccount 冻结)。到期由 worker 硬删除。
      .post("/deletion", async (c) => {
        const { scheduledAt } = await requestAccountDeletion(c.get("user").id);
        return c.json({ scheduledAt });
      })
      // 撤销注销:退出冷静期,账户恢复正常。此路由不受冻结门禁拦截(见 account.middleware)。
      .delete("/deletion", async (c) => {
        await cancelAccountDeletion(c.get("user").id);
        return c.body(null, 204);
      })
  );
}
