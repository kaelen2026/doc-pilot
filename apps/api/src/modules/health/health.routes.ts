import { Hono } from "hono";

/**
 * 健康检查路由。Phase 1 仅返回存活状态；
 * 后续阶段可扩展为检查数据库 / Redis / 对象存储连通性。
 */
export function createHealthRoutes() {
  return new Hono().get("/", (c) =>
    c.json({
      status: "ok",
      service: "api",
      time: new Date().toISOString(),
    }),
  );
}
