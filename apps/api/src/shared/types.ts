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
 * Hono 环境类型：鉴权中间件通过后，user / memberships 挂在 context 上。
 */
export type AppEnv = {
  Variables: {
    user: AuthUser;
    memberships: Membership[];
  };
};
