import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv, AuthUser } from "../shared/types";
import { requireAdmin } from "./admin.middleware";

/** 构造一个「已挂 user + requireAdmin + 受保护路由」的最小 app,便于对 Response 断言。 */
function appWith(user: AuthUser | null, isAdmin: (email: string) => boolean) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    if (user) {
      c.set("user", user);
    }
    await next();
  });
  app.use("*", requireAdmin({ isAdmin }));
  app.get("/ping", (c) => c.json({ ok: true }));
  return app;
}

const admin: AuthUser = { id: "u1", email: "admin@doc.local", name: "Admin" };
const stranger: AuthUser = { id: "u2", email: "user@doc.local", name: "User" };

describe("requireAdmin", () => {
  it("白名单用户放行,并以其邮箱查询白名单", async () => {
    const isAdmin = vi.fn().mockReturnValue(true);
    const res = await appWith(admin, isAdmin).request("/ping");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(isAdmin).toHaveBeenCalledWith("admin@doc.local");
  });

  it("非白名单用户返回 403 forbidden", async () => {
    const isAdmin = vi.fn().mockReturnValue(false);
    const res = await appWith(stranger, isAdmin).request("/ping");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("缺少已认证 user 时返回 403(防御:requireAdmin 必须挂在 requireAuth 之后)", async () => {
    const isAdmin = vi.fn().mockReturnValue(true);
    const res = await appWith(null, isAdmin).request("/ping");
    expect(res.status).toBe(403);
    expect(isAdmin).not.toHaveBeenCalled();
  });
});
