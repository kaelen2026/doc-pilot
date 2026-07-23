import { apiEnv } from "../env";

/**
 * 平台管理员判定的单一事实源(cross-cutting.md §25)。
 *
 * 平台 admin 是「跨所有 workspace」的角色,与 membership.role(workspace 内角色,MVP 仅
 * owner)不是一个维度,故不落在 memberships 表,而用 env 白名单(apiEnv.adminEmails)。
 * `requireAdmin` 中间件与 `/me` 的 isAdmin 标志都调本函数,避免两处各写一份比对逻辑。
 *
 * 比对大小写不敏感:白名单在 env.ts 已规范化为小写,这里同样把入参小写化。
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return apiEnv.adminEmails.includes(email.trim().toLowerCase());
}
