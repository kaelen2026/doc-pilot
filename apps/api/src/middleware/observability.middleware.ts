import { randomUUID } from "node:crypto";
import { httpMetrics, logger } from "@doc-pilot/observability";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../shared/types";

/**
 * 请求级可观测(cross-cutting.md §29.2/§29.3):为每个请求生成 requestId、计时,
 * 完成后记录结构化访问日志与 http_request_duration / http_request_errors。
 * metrics 的 route 标签用 Hono 匹配到的路由模式(如 /documents/:id),避免高基数。
 */
export function observability(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? randomUUID();
    c.header("x-request-id", requestId);
    const startedAt = performance.now();

    await next();

    const durationMs = Math.round(performance.now() - startedAt);
    const route = c.req.routePath ?? c.req.path;
    const status = c.res.status;
    httpMetrics.record({ method: c.req.method, route, status }, durationMs);
    logger.info("http.request", {
      requestId,
      method: c.req.method,
      route,
      path: c.req.path,
      status,
      durationMs,
    });
  };
}
