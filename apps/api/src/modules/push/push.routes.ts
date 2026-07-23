import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";
import { parseRegisterDevice } from "./push.schema";
import * as service from "./push.service";

/**
 * 设备令牌注册路由(受登录门禁保护,见 app.ts)。userId 一律取自认证用户,不信任请求参数。
 * APNS 实际投递不在这里——那是 admin 的 /admin/push-test(见 admin 模块)。
 */
export function createPushRoutes() {
  return new Hono<AppEnv>()
    .post("/devices", async (c) => {
      const input = parseRegisterDevice(await c.req.json().catch(() => null));
      const user = c.get("user");
      await service.registerDevice({ ...input, userId: user.id });
      return c.json({ ok: true });
    })
    .delete("/devices/:token", async (c) => {
      const user = c.get("user");
      const token = c.req.param("token").trim().toLowerCase();
      await service.unregisterDevice({ userId: user.id, token });
      return c.json({ ok: true });
    });
}
