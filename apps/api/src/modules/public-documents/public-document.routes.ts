import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";
import { getPublicDocument, getPublicDocumentFileUrl } from "./public-document.service";
export function createPublicDocumentRoutes() {
  return new Hono<AppEnv>()
    .get("/:id", async (c) => c.json({ document: await getPublicDocument(c.req.param("id")) }))
    .get("/:id/file-url", async (c) => c.json(await getPublicDocumentFileUrl(c.req.param("id"))));
}
