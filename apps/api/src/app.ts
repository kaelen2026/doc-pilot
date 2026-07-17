import { auth } from "@doc-pilot/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requireAuth } from "./middleware/auth.middleware";
import { createDocumentRoutes } from "./modules/documents/document.routes";
import { createHealthRoutes } from "./modules/health/health.routes";
import { createMeRoutes } from "./modules/me/me.routes";
import { getSession, loadMemberships } from "./shared/auth-context";
import type { AppEnv } from "./shared/types";

/**
 * 组装 Hono 应用。业务模块在此挂载（Route → Controller → Service → Repository）。
 * 参见 docs/architecture/overview.md 的模块边界。
 */
export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", logger());

  // 允许 web 源站带 cookie 跨源调用（web:3000 → api:3001）。
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  app.use("*", cors({ origin: [webOrigin], credentials: true }));

  // Better Auth 处理器（登录 / 验证码 / 会话），不经鉴权门禁。
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // 公开路由
  app.route("/health", createHealthRoutes());

  // 受保护路由：未登录返回 401（满足「未登录无法访问文档」验收）。
  const guard = requireAuth({ getSession, loadMemberships });
  app.use("/me", guard);
  app.use("/documents", guard);
  app.use("/documents/*", guard);
  app.route("/me", createMeRoutes());
  app.route("/documents", createDocumentRoutes());

  return app;
}

export type App = ReturnType<typeof createApp>;
