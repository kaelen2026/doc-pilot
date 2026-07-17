import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * 租户边界（ADR-008）。MVP 每个用户注册后自动创建一个 personal workspace。
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 32 }).notNull().default("personal"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("workspaces_owner_id_idx").on(t.ownerId)],
);

/**
 * 用户 ↔ workspace 成员关系。MVP 角色仅 owner（见 docs/architecture/cross-cutting.md §25）。
 * role 用 varchar + check 约束，不用 PostgreSQL ENUM（便于迁移，见 data-model.md）。
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("memberships_workspace_user_unique").on(t.workspaceId, t.userId),
    index("memberships_user_id_idx").on(t.userId),
    check("memberships_role_check", sql`${t.role} in ('owner')`),
  ],
);
