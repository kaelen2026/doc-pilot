import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";
import { activeWorkspaceId } from "../../shared/workspace";
import { parseSearchQuery } from "./search.schema";
import { searchDocuments } from "./search.service";

export function createSearchRoutes() {
  return new Hono<AppEnv>().get("/", async (c) => {
    const workspaceId = activeWorkspaceId(c.get("memberships"));
    const { query } = parseSearchQuery(c.req.query("q"));
    const results = await searchDocuments({
      workspaceId,
      userId: c.get("user").id,
      query,
    });
    return c.json({ results });
  });
}
