export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface Membership {
  workspaceId: string;
  role: string;
}

/**
 * Hono 环境类型：鉴权中间件通过后，user / memberships / 账户注销状态挂在 context 上。
 * accountDeletionScheduledAt 与 memberships 同源(一次查询取回),供 requireActiveAccount 判冻结,
 * 免去每请求一次额外 PK 查询。
 */
export type AppEnv = {
  Variables: {
    user: AuthUser;
    memberships: Membership[];
    accountDeletionScheduledAt: Date | null;
  };
};
