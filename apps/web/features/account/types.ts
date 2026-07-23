// 用户中心的 DTO 类型,对齐后端 `GET /me` 与 `GET /me/usage` 的响应形状。
// 配额维度形状与 apps/api 的 QuotaUsage 一致(used/limit),前端只做展示不重定义上限常量。

/** 当前用户(取自 better-auth user,仅列出用户中心用到的字段)。 */
export interface MeUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
}

/** 用户所属的一个 workspace 及其角色。 */
export interface WorkspaceMembership {
  id: string;
  name: string;
  role: string;
}

/** `GET /me` 响应。 */
export interface Me {
  user: MeUser;
  profile: {
    username: string;
    bio: string | null;
    location: string | null;
    websiteUrl: string | null;
    socialLinks: Record<string, string>;
  } | null;
  workspaces: WorkspaceMembership[];
  /** 是否平台管理员(邮箱白名单)。用于前端门禁 /admin 与侧栏入口。 */
  isAdmin: boolean;
  /** 非空表示账户处于注销冷静期,值为到期(硬删除)时刻的 ISO 串;前端据此冻结重定向。 */
  deletionScheduledAt: string | null;
}

/** 单个配额维度的用量与上限。 */
export interface UsageDimension {
  used: number;
  limit: number;
}

/** `GET /me/usage` 的 usage 字段:四个配额维度。 */
export interface Usage {
  storageBytes: UsageDimension;
  documentCount: UsageDimension;
  monthlyAiTokens: UsageDimension;
  monthlyQuestions: UsageDimension;
}
