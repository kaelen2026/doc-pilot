// 本包唯一读取 process.env 的地方。DATABASE_URL 缺省时不在此抛错——保持 import 安全
// (构建 / 单测 / Better Auth 装配无需真实 env);回退到本地默认串的逻辑与告警见 client.ts。
const DEFAULT_LOCAL_URL = "postgres://docpilot:docpilot@localhost:5432/docpilot";

export const databaseEnv = {
  /** Postgres 连接串;未设置时为 undefined,由消费方决定回退策略。 */
  url: process.env.DATABASE_URL,
  /** 本地默认连接串(见 client.ts 说明)。 */
  defaultLocalUrl: DEFAULT_LOCAL_URL,
} as const;
