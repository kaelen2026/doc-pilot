import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";

/**
 * 文档路由占位（Phase 3 实现）。当前仅用于验证鉴权门禁：
 * 未登录访问 /documents 返回 401；登录后返回空列表。
 */
export function createDocumentRoutes() {
  return new Hono<AppEnv>().get("/", (c) => {
    const memberships = c.get("memberships");
    return c.json({ documents: [], workspaceCount: memberships.length });
  });
}
