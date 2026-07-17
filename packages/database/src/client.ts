import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * 单例 Postgres 连接 + Drizzle 客户端。
 * 连接串来自环境变量 DATABASE_URL（见 .env.example）。
 *
 * postgres.js 是惰性连接：仅在第一次查询时才真正建连。因此这里在缺省
 * DATABASE_URL 时回退到本地默认串而非抛错——这样 import 本模块（构建、
 * 单元测试、Better Auth 配置装配）不会因缺少环境变量而失败；真正连库时
 * 若配置不对仍会报错。
 */
const DEFAULT_LOCAL_URL = "postgres://docpilot:docpilot@localhost:5432/docpilot";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[database] DATABASE_URL 未设置，回退到本地默认连接串");
    return DEFAULT_LOCAL_URL;
  }
  return url;
}

export const queryClient = postgres(getConnectionString());
export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
