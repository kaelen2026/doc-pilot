import type { MiddlewareHandler } from "hono";
import type { AppEnv, AuthUser, Membership } from "../shared/types";

export type SessionGetter = (headers: Headers) => Promise<{ user: AuthUser } | null>;
export type MembershipLoader = (userId: string) => Promise<Membership[]>;

/**
 * 鉴权门禁中间件（工厂形式，依赖注入 getSession / loadMemberships，
 * 便于在无数据库的情况下单测）。未登录返回 401；登录后把 user 与
 * memberships 挂到 context，供后续 controller / policy 使用。
 */
export function requireAuth(deps: {
  getSession: SessionGetter;
  loadMemberships: MembershipLoader;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = await deps.getSession(c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const memberships = await deps.loadMemberships(session.user.id);
    c.set("user", session.user);
    c.set("memberships", memberships);
    await next();
  };
}
