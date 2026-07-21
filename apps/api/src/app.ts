import { auth } from "@doc-pilot/auth";
import { RATE_LIMITS } from "@doc-pilot/contracts";
import { errToLog, logger } from "@doc-pilot/observability";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiEnv } from "./env";
import { requireAuth } from "./middleware/auth.middleware";
import { observability } from "./middleware/observability.middleware";
import { createConversationRoutes } from "./modules/conversations/conversation.routes";
import { createDocumentRoutes } from "./modules/documents/document.routes";
import { createHealthRoutes, type ReadinessProbes } from "./modules/health/health.routes";
import { createMeRoutes } from "./modules/me/me.routes";
import { getSession, loadMemberships } from "./shared/auth-context";
import { DomainError } from "./shared/errors";
import { NoopRateLimiter, otpRateLimit, type RateLimiter, rateLimit } from "./shared/rate-limit";
import type { AppEnv } from "./shared/types";

/** 仅对指定 HTTP 方法运行内层中间件,其余方法放行(app.use 不区分方法)。 */
function onMethod(method: string, mw: MiddlewareHandler<AppEnv>): MiddlewareHandler<AppEnv> {
  return (c, next) => (c.req.method === method ? mw(c, next) : next());
}

/**
 * 组装 Hono 应用。业务模块在此挂载（Route → Controller → Service → Repository）。
 * 参见 docs/architecture/overview.md 的模块边界。
 *
 * rateLimiter 通过依赖注入:index.ts 注入 Redis 实现,单测默认 Noop(不连 Redis)。
 */
export function createApp(deps: { rateLimiter?: RateLimiter; readiness?: ReadinessProbes } = {}) {
  const app = new Hono<AppEnv>();
  const limiter = deps.rateLimiter ?? new NoopRateLimiter();

  // 请求级可观测:结构化访问日志 + http 指标 + requestId。
  app.use("*", observability());

  // 允许 web 源站带 cookie 跨源调用（web:3000 → api:3001）。
  app.use("*", cors({ origin: [apiEnv.webOrigin], credentials: true }));

  // 登录验证码限流(5 次/小时/邮箱),必须在 auth.handler 之前。
  app.use("/api/auth/*", otpRateLimit(limiter));
  // Better Auth 处理器（登录 / 验证码 / 会话），不经鉴权门禁。
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // 公开路由
  app.route("/health", createHealthRoutes(deps.readiness));

  // 受保护路由：未登录返回 401（满足「未登录无法访问文档」验收）。
  const guard = requireAuth({ getSession, loadMemberships });
  app.use("/me", guard);
  app.use("/documents", guard);
  app.use("/documents/*", guard);
  app.use("/conversations", guard);
  app.use("/conversations/*", guard);

  // 贵操作限流(用户维度),挂在 guard 之后以便拿到 user。
  const subjectByUser = (c: Context<AppEnv>) => c.get("user")?.id ?? null;
  app.use(
    "/documents",
    onMethod(
      "POST",
      rateLimit({
        limiter,
        rule: RATE_LIMITS.uploadCreate,
        name: "upload",
        subject: subjectByUser,
      }),
    ),
  );
  app.use(
    "/conversations/:id/messages",
    onMethod(
      "POST",
      rateLimit({ limiter, rule: RATE_LIMITS.ask, name: "ask", subject: subjectByUser }),
    ),
  );

  app.route("/me", createMeRoutes());
  app.route("/documents", createDocumentRoutes());
  app.route("/conversations", createConversationRoutes());

  // 统一错误映射：领域错误 → 对应 HTTP 状态。
  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400);
    }
    logger.error("http.unhandled_error", { path: c.req.path, ...errToLog(err) });
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
