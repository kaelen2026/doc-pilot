import { withSpan } from "@doc-pilot/observability";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, AuthUser, Membership } from "../shared/types";

export type SessionGetter = (headers: Headers) => Promise<{ user: AuthUser } | null>;

/** 一次查询取回账户上下文:所属 membership + 账户注销冷静期状态(见 loadAccountContext)。 */
export interface AccountContext {
  memberships: Membership[];
  deletionScheduledAt: Date | null;
}
export type AccountContextLoader = (userId: string) => Promise<AccountContext>;

/**
 * 鉴权门禁中间件（工厂形式，依赖注入 getSession / loadAccountContext，
 * 便于在无数据库的情况下单测）。未登录返回 401；登录后把 user / memberships /
 * 账户注销状态挂到 context，供后续 controller / policy / 冻结门禁使用。
 */
export function requireAuth(deps: {
  getSession: SessionGetter;
  loadAccountContext: AccountContextLoader;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = await withSpan("auth.verify", () => deps.getSession(c.req.raw.headers));
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const account = await deps.loadAccountContext(session.user.id);
    c.set("user", session.user);
    c.set("memberships", account.memberships);
    c.set("accountDeletionScheduledAt", account.deletionScheduledAt);
    await next();
  };
}
