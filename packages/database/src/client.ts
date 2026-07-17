import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * 单例 Postgres 连接 + Drizzle 客户端。
 * 连接串来自环境变量 DATABASE_URL（见 .env.example）。
 */
function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export const queryClient = postgres(getConnectionString());
export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
