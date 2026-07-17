import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";
import { ForbiddenError } from "./document.errors";
import { parseCreateUpload } from "./document.schema";
import { completeUpload, createUpload, listDocuments } from "./document.service";

/**
 * 解析当前活跃 workspace。MVP：用户只有一个 personal workspace，取第一个 membership。
 * 租户隔离（ADR-008）：service 始终按该 workspaceId 过滤。
 */
function activeWorkspaceId(memberships: AppEnv["Variables"]["memberships"]): string {
  const first = memberships[0];
  if (!first) {
    throw new ForbiddenError("no workspace for current user");
  }
  return first.workspaceId;
}

export function createDocumentRoutes() {
  return new Hono<AppEnv>()
    .post("/", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const body = await c.req.json().catch(() => null);
      const input = parseCreateUpload(body);
      const idempotencyKey = c.req.header("Idempotency-Key");
      const result = await createUpload({
        workspaceId,
        ownerId: c.get("user").id,
        idempotencyKey,
        input,
      });
      return c.json(result, 201);
    })
    .post("/:id/complete-upload", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const result = await completeUpload({ workspaceId, documentId: c.req.param("id") });
      return c.json(result);
    })
    .get("/", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const documents = await listDocuments(workspaceId);
      return c.json({ documents });
    });
}
