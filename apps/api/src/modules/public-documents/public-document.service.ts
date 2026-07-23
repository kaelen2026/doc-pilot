import { buildOriginalObjectKey, createPresignedGetUrl } from "@doc-pilot/storage";
import { NotFoundError } from "../../shared/errors";
import { findPublicDocument } from "./public-document.repository";

export async function getPublicDocument(documentId: string) {
  const row = await findPublicDocument(documentId);
  if (!row) throw new NotFoundError("public document not found");
  const { workspaceId: _, processingVersion: __, originalFilename: ___, ...document } = row;
  return document;
}
export async function getPublicDocumentFileUrl(documentId: string) {
  const row = await findPublicDocument(documentId);
  if (!row) throw new NotFoundError("public document not found");
  const { url, expiresAt } = await createPresignedGetUrl({
    key: buildOriginalObjectKey({
      workspaceId: row.workspaceId,
      documentId: row.id,
      version: row.processingVersion,
    }),
    filename: row.originalFilename,
  });
  return { url, expiresAt: expiresAt.toISOString() };
}
