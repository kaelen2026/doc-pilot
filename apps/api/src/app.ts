import { auth } from "@doc-pilot/auth";
import { RATE_LIMITS } from "@doc-pilot/contracts";
import { errToLog, logger } from "@doc-pilot/observability";
import { InMemoryNotificationBus, type NotificationBus } from "@doc-pilot/queue";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiEnv } from "./env";
import { requireActiveAccount } from "./middleware/account.middleware";
import { requireAdmin } from "./middleware/admin.middleware";
import { requireAuth } from "./middleware/auth.middleware";
import { observability } from "./middleware/observability.middleware";
import { createAdminRoutes } from "./modules/admin/admin.routes";
import { createConversationRoutes } from "./modules/conversations/conversation.routes";
import { createDocumentRoutes } from "./modules/documents/document.routes";
import { createHealthRoutes, type ReadinessProbes } from "./modules/health/health.routes";
import { getDeletionScheduledAt } from "./modules/me/me.repository";
import { createMeRoutes } from "./modules/me/me.routes";
import { createNotificationRoutes } from "./modules/notifications/notification.routes";
import { createProfileRoutes, createPublicProfileRoutes } from "./modules/profiles/profile.routes";
import { createPublicDocumentRoutes } from "./modules/public-documents/public-document.routes";
import { createSearchRoutes } from "./modules/search/search.routes";
import { isAdminEmail } from "./shared/admin";
import { getSession, loadMemberships } from "./shared/auth-context";
import { DomainError } from "./shared/errors";
import {
  deviceCodeRateLimit,
  NoopRateLimiter,
  otpRateLimit,
  type RateLimiter,
  rateLimit,
} from "./shared/rate-limit";
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
export function createApp(
  deps: {
    rateLimiter?: RateLimiter;
    readiness?: ReadinessProbes;
    notificationBus?: NotificationBus;
  } = {},
) {
  const app = new Hono<AppEnv>();
  const limiter = deps.rateLimiter ?? new NoopRateLimiter();
  // 通知实时脉冲总线:index.ts 注入 Redis 实现;未注入时用内存实现(单测/单进程)。
  const notificationBus = deps.notificationBus ?? new InMemoryNotificationBus();

  // 请求级可观测:结构化访问日志 + http 指标 + requestId。
  app.use("*", observability());

  // 允许 web 源站带 cookie 跨源调用（web:3000 → api:3001）。
  app.use("*", cors({ origin: [apiEnv.webOrigin], credentials: true }));

  // 登录验证码限流(5 次/小时/邮箱),必须在 auth.handler 之前。
  app.use("/api/auth/*", otpRateLimit(limiter));
  // 扫码登录取码限流(按 IP,10 次/分钟),同样必须在 auth.handler 之前。
  app.use("/api/auth/*", deviceCodeRateLimit(limiter));
  // Better Auth 处理器（登录 / 验证码 / 会话 / 设备授权），不经鉴权门禁。
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // 公开路由
  app.route("/health", createHealthRoutes(deps.readiness));
  app.route("/public/profiles", createPublicProfileRoutes());
  app.route("/public/documents", createPublicDocumentRoutes());

  // 受保护路由：未登录返回 401（满足「未登录无法访问文档」验收）。
  const guard = requireAuth({ getSession, loadMemberships });
  app.use("/me", guard);
  // /me/* 子路由(如 /me/usage)同样受保护:Hono 的 use("/me") 只匹配精确路径,
  // 漏了这条会让子路由绕过鉴权,且拿不到 memberships(activeWorkspaceId 会崩)。
  app.use("/me/*", guard);
  app.use("/documents", guard);
  app.use("/documents/*", guard);
  app.use("/conversations", guard);
  app.use("/conversations/*", guard);
  app.use("/search", guard);
  app.use("/notifications", guard);
  app.use("/notifications/*", guard);
  app.use("/users/*", guard);
  // 平台管理后台:先过登录门禁(拿到 user),再过 requireAdmin(邮箱白名单)。两条链路
  // 都要覆盖精确路径与子路径(与 /me 同理)。requireAdmin 是所有跨租户查询的唯一闸门。
  const adminGuard = requireAdmin({ isAdmin: isAdminEmail });
  app.use("/admin", guard);
  app.use("/admin/*", guard);
  app.use("/admin", adminGuard);
  app.use("/admin/*", adminGuard);

  // 冷静期冻结门禁:处于注销冷静期的账户禁止访问业务端点(挂在 guard 之后,拿得到 user)。
  // 刻意不挂 /me——「恢复账户」页要能读 /me 状态、撤销(DELETE /me/deletion)、退出登录。
  const activeAccount = requireActiveAccount({ getDeletionState: getDeletionScheduledAt });
  // /me 整体放行(恢复页要读状态/撤销/退出),但 /me/profile 是业务写(改公开主页),须冻结。
  app.use("/me/profile", activeAccount);
  app.use("/documents", activeAccount);
  app.use("/documents/*", activeAccount);
  app.use("/conversations", activeAccount);
  app.use("/conversations/*", activeAccount);
  app.use("/search", activeAccount);
  app.use("/notifications", activeAccount);
  app.use("/notifications/*", activeAccount);
  app.use("/users/*", activeAccount);
  app.use("/admin", activeAccount);
  app.use("/admin/*", activeAccount);

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
  // 每次搜索触发一次查询 embedding,按用户限流。
  app.use(
    "/search",
    onMethod(
      "GET",
      rateLimit({ limiter, rule: RATE_LIMITS.search, name: "search", subject: subjectByUser }),
    ),
  );

  app.route("/me", createMeRoutes());
  app.route("/documents", createDocumentRoutes());
  app.route("/conversations", createConversationRoutes());
  app.route("/search", createSearchRoutes());
  app.route("/notifications", createNotificationRoutes({ bus: notificationBus }));
  app.route("/admin", createAdminRoutes());
  app.route("/", createProfileRoutes());

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
