import { db } from "@doc-pilot/database";
import { documents, user, userProfiles } from "@doc-pilot/database/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

export async function findPublicDocument(id: string) {
  const [row] = await db
    .select({
      id: documents.id,
      title: documents.title,
      originalFilename: documents.originalFilename,
      pageCount: documents.pageCount,
      createdAt: documents.createdAt,
      processingVersion: documents.processingVersion,
      workspaceId: documents.workspaceId,
      ownerUsername: userProfiles.username,
      ownerName: user.name,
    })
    .from(documents)
    .innerJoin(userProfiles, eq(documents.ownerId, userProfiles.userId))
    .innerJoin(user, eq(documents.ownerId, user.id))
    .where(
      and(
        eq(documents.id, id),
        eq(documents.visibility, "public"),
        inArray(documents.status, ["ready", "partially_ready"]),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return row;
}
