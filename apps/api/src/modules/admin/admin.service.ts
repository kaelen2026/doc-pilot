import * as repo from "./admin.repository";
import { buildUsageReport, type UsageReport } from "./admin.rollup";
import type { PageQuery, UsageQuery } from "./admin.schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 平台总览统计(所有 workspace 汇总)。 */
export function getOverview() {
  return repo.getOverview();
}

/** 窗口内用量报表:算出 since,取分组数据,交纯函数装配。 */
export async function getUsageReport(query: UsageQuery): Promise<UsageReport & { days: number }> {
  const since = new Date(Date.now() - query.days * DAY_MS);
  const grouped = await repo.usageSince(since);
  return { ...buildUsageReport(grouped), days: query.days };
}

/** 全量 workspace 列表(分页)。 */
export function listWorkspaces(page: PageQuery) {
  return repo.listWorkspaces(page);
}

/** 全量用户列表(分页)。 */
export function listUsers(page: PageQuery) {
  return repo.listUsers(page);
}
