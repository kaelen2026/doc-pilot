import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Better Auth device-authorization 插件(RFC 8628,扫码登录底座)的存储表。
 *
 * 字段名(JS 属性)必须与插件声明的 field 名逐字一致 —— drizzle 适配器按属性名匹配,
 * 见 packages/auth/src/auth-plugins.ts 的 deviceAuthorization。物理列名用 snake_case。
 * 短生命周期(默认 2 分钟即过期),不承载持久业务事实。
 */
export const deviceCode = pgTable(
  "device_code",
  {
    id: text("id").primaryKey(),
    // 轮询密钥(高熵 40 字符),web 用它换会话;唯一以保护轮询查找。
    deviceCode: text("device_code").notNull().unique(),
    // 展示给用户/编入二维码的短码,iOS 扫码后按它批准。
    userCode: text("user_code").notNull(),
    // 批准前为空;批准后指向授权用户。
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    // pending / approved / denied,VARCHAR + 应用层判定(见架构不变量:不用 PG ENUM)。
    status: text("status").notNull(),
    lastPolledAt: timestamp("last_polled_at"),
    // 轮询间隔(毫秒),插件据此触发 slow_down。
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("device_code_user_code_idx").on(t.userCode)],
);
