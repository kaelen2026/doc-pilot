import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";
import { parsePageQuery, parseTestPush, parseUsageQuery } from "./admin.schema";
import * as service from "./admin.service";

/**
 * 平台管理后台路由(cross-cutting.md §25)。除 push-test(会真实投递 APNS)外均为只读跨租户聚合。
 * 授权在挂载处的 requireAdmin 守卫完成(见 app.ts),本文件默认调用者已是平台 admin。
 */
export function createAdminRoutes() {
  return new Hono<AppEnv>()
    .get("/overview", async (c) => c.json(await service.getOverview()))
    .get("/usage", async (c) => {
      const query = parseUsageQuery({ days: c.req.query("days") });
      return c.json(await service.getUsageReport(query));
    })
    .get("/workspaces", async (c) => {
      const page = parsePageQuery({ limit: c.req.query("limit"), offset: c.req.query("offset") });
      return c.json({ workspaces: await service.listWorkspaces(page) });
    })
    .get("/users", async (c) => {
      const page = parsePageQuery({ limit: c.req.query("limit"), offset: c.req.query("offset") });
      return c.json({ users: await service.listUsers(page) });
    })
    .post("/push-test", async (c) => {
      const input = parseTestPush(await c.req.json().catch(() => null));
      return c.json(await service.sendTestPush(input));
    });
}
