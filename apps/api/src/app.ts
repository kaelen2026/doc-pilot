import { Hono } from "hono";
import { logger } from "hono/logger";
import { healthRoutes } from "./modules/health/health.routes";

/**
 * 组装 Hono 应用。业务模块在此挂载（Route → Controller → Service → Repository）。
 * 参见 docs/architecture/overview.md 的模块边界。
 */
export function createApp() {
  const app = new Hono();

  app.use("*", logger());

  app.route("/health", healthRoutes);

  return app;
}

export type App = ReturnType<typeof createApp>;
