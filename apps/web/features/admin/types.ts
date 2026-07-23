// 管理后台 DTO,对齐后端 apps/api/src/modules/admin 的响应形状。前端只做展示,不重定义
// 后端已有的口径。所有接口均为跨租户只读聚合(授权在 API 的 requireAdmin 完成)。

/** 一组用量指标(成本/token/调用次数)。 */
export interface UsageMetrics {
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  count: number;
}

export interface UsageByDay extends UsageMetrics {
  /** 'YYYY-MM-DD'。 */
  day: string;
}

export interface UsageByModel extends UsageMetrics {
  model: string;
}

/** `GET /admin/overview`。 */
export interface AdminOverview {
  userCount: number;
  workspaceCount: number;
  documentCount: number;
  usage: UsageMetrics;
}

/** `GET /admin/usage?days=`。 */
export interface AdminUsageReport {
  byDay: UsageByDay[];
  byModel: UsageByModel[];
  totals: UsageMetrics;
  days: number;
}

/** `GET /admin/workspaces` 的一行。 */
export interface AdminWorkspace {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  ownerEmail: string;
  documentCount: number;
  memberCount: number;
}

/** `GET /admin/users` 的一行。 */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  workspaceCount: number;
}
