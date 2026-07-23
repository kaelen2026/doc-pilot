import type { MiddlewareHandler } from "hono";
import { AccountPendingDeletionError } from "../modules/me/me.errors";
import type { AppEnv } from "../shared/types";

/**
 * 冷静期冻结门禁。挂在 requireAuth 之后:读 requireAuth 已随 membership 一并载入的
 * accountDeletionScheduledAt(免去每请求额外 PK 查询),非空即拒绝(冻结)业务端点。
 *
 * 只挂在业务路由组上,**不挂 /me**——前端「恢复账户」页要能读 /me 状态、撤销(/me/deletion)、
 * 退出登录。「绝不信前端」:即便前端已重定向,后端仍须硬挡业务端点,故此中间件不可省。
 */
export const requireActiveAccount: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("accountDeletionScheduledAt")) {
    throw new AccountPendingDeletionError();
  }
  await next();
};
