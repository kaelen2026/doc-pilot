import { apiApnsClient } from "../../push/apns";
import { NotFoundError } from "../../shared/errors";
import type { DisplaySendResult } from "../push/push.send";
import * as pushService from "../push/push.service";
import * as repo from "./admin.repository";
import { buildUsageReport, type UsageReport } from "./admin.rollup";
import type { PageQuery, TestPushInput, UsageQuery } from "./admin.schema";

/** 测试推送对外结果:含收件邮箱与计数,逐设备结果的令牌已脱敏;不回传完整/失效令牌。 */
export interface TestPushReport {
  email: string;
  requested: number;
  sent: number;
  failed: number;
  /** 因失效(410/BadDeviceToken)而被清除的令牌数。 */
  invalidPruned: number;
  results: DisplaySendResult[];
}

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

/**
 * 给指定邮箱用户发一条测试推送(平台 admin 专用)。
 * 跨租户按邮箱定位收件人(admin repo),再调 push 模块的 service 发到其全部设备。
 * 收件人不存在 → 404;APNS 未配置 → push 模块抛 503(PushNotConfiguredError)。
 */
export async function sendTestPush(input: TestPushInput): Promise<TestPushReport> {
  const target = await repo.findUserByEmail(input.email);
  if (!target) {
    throw new NotFoundError("该邮箱没有对应用户");
  }
  const { invalidTokens, ...summary } = await pushService.sendTestPushToUser({
    userId: target.id,
    title: input.title,
    body: input.body,
    // 角标 = 收件人真实未读数(而非硬编码);与 Worker 通知推送、iOS 前台重同步同一口径。
    badge: await repo.countUnreadByUserId(target.id),
    apns: apiApnsClient(),
  });
  // 只回传失效令牌的**数量**,完整令牌(即便已删)不出 API。
  return { email: target.email, invalidPruned: invalidTokens.length, ...summary };
}
