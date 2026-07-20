import { existsSync } from "node:fs";
import path from "node:path";

// drizzle-kit(migrate / generate / studio)直接执行 config → 本文件,不经过 api/worker 那层
// tsx `--env-file-if-exists`,故在此补一层加载:仓库根 .env 存在则读入,使 databaseEnv 能拿到
// DATABASE_URL。相对运行目录 ../../.env——drizzle-kit 从 packages/database、api/worker 从各 app
// 目录运行,均为根下两级,故都指向根 .env(比 import.meta.dirname 稳:drizzle-kit 会打包 config)。
// CI/生产无 .env 文件则跳过;loadEnvFile 不覆盖已存在的环境变量,真实 env 始终优先。
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

// 本包唯一读取 process.env 的地方。DATABASE_URL 缺省时不在此抛错——保持 import 安全
// (构建 / 单测 / Better Auth 装配无需真实 env);回退到本地默认串的逻辑与告警见 client.ts。
const DEFAULT_LOCAL_URL = "postgres://docpilot:docpilot@localhost:5432/docpilot";

// 连接池上限(每进程)。postgres.js 默认 10;api 与 worker 各是独立进程,各自持有一池。
// 高并发(如万级 DAU)下 10 会被 SSE 长连接 + 检索查询打满,故抽成可调项。真正上量时应在
// 前面加 PgBouncer 并据 Postgres max_connections 反推此值,别无脑调大直接压垮 PG。
const DEFAULT_POOL_MAX = 10;

export const databaseEnv = {
  /** Postgres 连接串;未设置时为 undefined,由消费方决定回退策略。 */
  url: process.env.DATABASE_URL,
  /** 本地默认连接串(见 client.ts 说明)。 */
  defaultLocalUrl: DEFAULT_LOCAL_URL,
  /** 连接池上限(每进程);见上方说明。缺省 10,与 postgres.js 默认一致。 */
  poolMax: Number(process.env.DATABASE_POOL_MAX ?? DEFAULT_POOL_MAX),
} as const;
