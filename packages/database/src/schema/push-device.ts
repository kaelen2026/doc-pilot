import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * 移动端推送设备令牌注册表(APNS / FCM)。
 *
 * 归属:**按用户身份键控,不做 workspace 作用域**——一台设备属于一个登录用户,而非某个工作区
 * (用户可属于多个 workspace)。这与 auth 的 session / device_code 表同源:它们都按 user.id 键控,
 * 不进租户隔离(ADR-008 的租户隔离约束针对**租户业务数据**,身份级数据不适用)。注册时 user_id
 * 一律取自**已认证调用者**,不信任请求参数;平台 admin 发测试推送时按用户查其令牌(走 admin 的
 * 跨租户查询路径)。
 *
 * - token 唯一:同一设备重复注册走 upsert(幂等),换绑用户时把令牌迁到新 user_id 并刷新 last_seen。
 * - platform / environment 用 VARCHAR + 应用层校验(合法取值见 @doc-pilot/contracts),不用 PG ENUM
 *   (data-model.md §8.1:加约束比改 ENUM 更易迁移)。environment 区分 APNS sandbox / production,
 *   必须与 App 的 aps-environment entitlement 一致,否则投递必失败(BadDeviceToken)。
 * - last_seen_at 每次注册刷新,便于日后清理长期不活跃的令牌。
 */
export const pushDevices = pgTable(
  "push_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 设备归属用户。TEXT 引用 Better Auth 的 user.id(见 notifications.user_id 同款说明)。
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // APNS 或 FCM 设备令牌。唯一以支撑 upsert 幂等注册。
    token: text("token").notNull().unique(),
    // "ios" | "android"。
    platform: varchar("platform", { length: 20 }).notNull(),
    // "sandbox" | "production"。
    environment: varchar("environment", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // 按用户查其全部设备令牌(admin 发推送、用户登出清理)。
    index("push_devices_user_idx").on(t.userId),
  ],
);
