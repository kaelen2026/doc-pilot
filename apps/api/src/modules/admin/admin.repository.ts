import { db } from "@doc-pilot/database";
import {
  aiGenerations,
  documents,
  memberships,
  user,
  workspaces,
} from "@doc-pilot/database/schema";
import { desc, gte, isNull, sql } from "drizzle-orm";
import type { UsageByDay, UsageByModel, UsageMetrics } from "./admin.rollup";

/**
 * 平台管理员的数据访问层——**刻意的、唯一的跨租户查询路径**。
 *
 * 全仓库其它数据访问都走 `scoped*(workspaceId)` 工厂,把 `workspace_id` 过滤注入每条
 * 查询(租户隔离不变量,ADR-008 / cross-cutting.md §25)。平台 admin 的语义正相反:它要
 * 看**所有** workspace 的汇总。故本文件的查询**不带 workspace 过滤**,这是被 ADR-008
 * 「引入授权 seam」触发条件认可的例外,而非在 scoped repo 上打补丁的疏漏。
 *
 * 访问它的唯一入口是 requireAdmin 守卫后的 /admin 路由;业务/租户代码不得 import 本文件。
 */

export interface AdminOverview {
  userCount: number;
  workspaceCount: number;
  documentCount: number;
  /** 全时段 AI 用量总计(成本/token/调用次数)。 */
  usage: UsageMetrics;
}

export interface AdminWorkspaceRow {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  ownerEmail: string;
  documentCount: number;
  memberCount: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  workspaceCount: number;
}

const num = (v: unknown): number => Number(v ?? 0);

async function scalar(query: Promise<{ v: unknown }[]>): Promise<number> {
  const [row] = await query;
  return num(row?.v);
}

/** 总览:三个计数 + 全时段用量汇总。 */
export async function getOverview(): Promise<AdminOverview> {
  const [userCount, workspaceCount, documentCount, usageRow] = await Promise.all([
    scalar(db.select({ v: sql`count(*)` }).from(user)),
    scalar(db.select({ v: sql`count(*)` }).from(workspaces)),
    scalar(db.select({ v: sql`count(*)` }).from(documents).where(isNull(documents.deletedAt))),
    db
      .select({
        costMicros: sql`coalesce(sum(${aiGenerations.costMicros}), 0)`,
        inputTokens: sql`coalesce(sum(${aiGenerations.inputTokens}), 0)`,
        outputTokens: sql`coalesce(sum(${aiGenerations.outputTokens}), 0)`,
        count: sql`count(*)`,
      })
      .from(aiGenerations),
  ]);
  const u = usageRow[0];
  return {
    userCount,
    workspaceCount,
    documentCount,
    usage: {
      costMicros: num(u?.costMicros),
      inputTokens: num(u?.inputTokens),
      outputTokens: num(u?.outputTokens),
      count: num(u?.count),
    },
  };
}

/** 窗口内(created_at >= since)按天 / 按模型分组的用量。分组结果集有界。 */
export async function usageSince(
  since: Date,
): Promise<{ byDay: UsageByDay[]; byModel: UsageByModel[] }> {
  const dayExpr = sql<string>`to_char(date_trunc('day', ${aiGenerations.createdAt}), 'YYYY-MM-DD')`;
  const [byDayRows, byModelRows] = await Promise.all([
    db
      .select({
        day: dayExpr,
        costMicros: sql`coalesce(sum(${aiGenerations.costMicros}), 0)`,
        inputTokens: sql`coalesce(sum(${aiGenerations.inputTokens}), 0)`,
        outputTokens: sql`coalesce(sum(${aiGenerations.outputTokens}), 0)`,
        count: sql`count(*)`,
      })
      .from(aiGenerations)
      .where(gte(aiGenerations.createdAt, since))
      .groupBy(dayExpr),
    db
      .select({
        model: aiGenerations.model,
        costMicros: sql`coalesce(sum(${aiGenerations.costMicros}), 0)`,
        inputTokens: sql`coalesce(sum(${aiGenerations.inputTokens}), 0)`,
        outputTokens: sql`coalesce(sum(${aiGenerations.outputTokens}), 0)`,
        count: sql`count(*)`,
      })
      .from(aiGenerations)
      .where(gte(aiGenerations.createdAt, since))
      .groupBy(aiGenerations.model),
  ]);
  return {
    byDay: byDayRows.map((r) => ({
      day: r.day,
      costMicros: num(r.costMicros),
      inputTokens: num(r.inputTokens),
      outputTokens: num(r.outputTokens),
      count: num(r.count),
    })),
    byModel: byModelRows.map((r) => ({
      model: r.model,
      costMicros: num(r.costMicros),
      inputTokens: num(r.inputTokens),
      outputTokens: num(r.outputTokens),
      count: num(r.count),
    })),
  };
}

/** 全量 workspace(带 owner 邮箱、文档数、成员数),按创建时间倒序分页。 */
export async function listWorkspaces(page: {
  limit: number;
  offset: number;
}): Promise<AdminWorkspaceRow[]> {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      type: workspaces.type,
      createdAt: workspaces.createdAt,
      ownerEmail: user.email,
      // 相关子查询避免 join 扇出导致计数翻倍(文档与成员是 workspace 的两个独立子集)。
      documentCount: sql<number>`(select count(*) from ${documents} d where d.workspace_id = ${workspaces.id} and d.deleted_at is null)`,
      memberCount: sql<number>`(select count(*) from ${memberships} m where m.workspace_id = ${workspaces.id})`,
    })
    .from(workspaces)
    .innerJoin(user, sql`${user.id} = ${workspaces.ownerId}`)
    .orderBy(desc(workspaces.createdAt))
    .limit(page.limit)
    .offset(page.offset);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    createdAt: r.createdAt.toISOString(),
    ownerEmail: r.ownerEmail,
    documentCount: num(r.documentCount),
    memberCount: num(r.memberCount),
  }));
}

/** 全量用户(带所属 workspace 数),按创建时间倒序分页。 */
export async function listUsers(page: { limit: number; offset: number }): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      // 显式限定外层 "user"."id":本查询无 join,drizzle 会把 user 列渲成裸名 "id",
      // 与子查询内 memberships.id(uuid)撞名,导致 text = uuid。故此处不用 ${user.id}。
      workspaceCount: sql<number>`(select count(*) from ${memberships} m where m.user_id = "user"."id")`,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(page.limit)
    .offset(page.offset);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    emailVerified: r.emailVerified,
    createdAt: r.createdAt.toISOString(),
    workspaceCount: num(r.workspaceCount),
  }));
}
