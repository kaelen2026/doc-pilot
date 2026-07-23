import type { MiddlewareHandler } from "hono";
import { AccountPendingDeletionError } from "../modules/me/me.errors";
import type { AppEnv } from "../shared/types";

export type DeletionStateLoader = (userId: string) => Promise<Date | null>;

/**
 * 冷静期冻结门禁(工厂形式,DI getDeletionState 便于无库单测)。挂在 requireAuth 之后
 * (需 c.get("user"))。处于注销冷静期(deletion_scheduled_at 非空)的账户,业务端点一律拒绝。
 *
 * 只挂在业务路由组上,**不挂 /me**——前端「恢复账户」页要能读 /me 状态、撤销(/me/deletion)、
 * 退出登录。「绝不信前端」:即便前端已重定向,后端仍须硬挡业务端点,故此中间件不可省。
 */
export function requireActiveAccount(deps: {
  getDeletionState: DeletionStateLoader;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const scheduledAt = await deps.getDeletionState(c.get("user").id);
    if (scheduledAt) {
      throw new AccountPendingDeletionError();
    }
    await next();
  };
}
