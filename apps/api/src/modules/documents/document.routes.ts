import { Hono } from "hono";
import { ValidationError } from "../../shared/errors";
import type { AppEnv } from "../../shared/types";
import { activeWorkspaceId } from "../../shared/workspace";
import { parseCreateUpload } from "./document.schema";
import {
  completeUpload,
  createUpload,
  getDocument,
  getFileUrl,
  listDocuments,
  setDocumentVisibility,
} from "./document.service";

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
    })
    .get("/:id", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const result = await getDocument({ workspaceId, documentId: c.req.param("id") });
      return c.json(result);
    })
    .get("/:id/file-url", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const result = await getFileUrl({ workspaceId, documentId: c.req.param("id") });
      return c.json(result);
    })
    .patch("/:id/visibility", async (c) => {
      const workspaceId = activeWorkspaceId(c.get("memberships"));
      const body = (await c.req.json().catch(() => null)) as { visibility?: unknown } | null;
      if (body?.visibility !== "private" && body?.visibility !== "public") {
        throw new ValidationError("visibility must be private or public");
      }
      return c.json(
        await setDocumentVisibility({
          workspaceId,
          documentId: c.req.param("id"),
          visibility: body.visibility,
        }),
      );
    });
}
