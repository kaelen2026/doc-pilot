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
  workspaces: WorkspaceMembership[];
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
