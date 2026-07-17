import { auth } from "@doc-pilot/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requireAuth } from "./middleware/auth.middleware";
import { createConversationRoutes } from "./modules/conversations/conversation.routes";
import { DomainError } from "./modules/documents/document.errors";
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
  app.use("/conversations", guard);
  app.use("/conversations/*", guard);
  app.route("/me", createMeRoutes());
  app.route("/documents", createDocumentRoutes());
  app.route("/conversations", createConversationRoutes());

  // 统一错误映射：领域错误 → 对应 HTTP 状态。
  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400);
    }
    console.error("[api] unhandled error:", err);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
