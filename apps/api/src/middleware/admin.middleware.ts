import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../shared/types";

export type AdminCheck = (email: string) => boolean;

/**
 * 平台管理员门禁(工厂形式,依赖注入 isAdmin 便于无 env 单测)。
 *
 * 必须挂在 `requireAuth` 之后——它读取 context 上已认证的 user;拿不到 user(理论上不
 * 该发生)按未授权处理。非管理员返回 403(与 requireAuth 返回 401 的写法对齐:边界层
 * 直接出 c.json,不抛领域错误)。这是 /admin 一切跨租户查询的唯一授权闸门,前端门禁只
 * 是 UX,真正的拦截在这里(「永不信任前端」不变量,cross-cutting.md §25)。
 */
export function requireAdmin(deps: { isAdmin: AdminCheck }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user || !deps.isAdmin(user.email)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  };
}
