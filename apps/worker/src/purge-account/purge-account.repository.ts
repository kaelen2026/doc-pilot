import { db } from "@doc-pilot/database";
import { documentFiles, documents, user, workspaces } from "@doc-pilot/database/schema";
import { deleteObject } from "@doc-pilot/storage";
import { and, eq, inArray, isNotNull, lte, or } from "drizzle-orm";
import type { DueAccount, PurgeConfig, PurgeDeps } from "./purger";

/**
 * 用真实 DB + 对象存储构造 PurgeDeps。硬删除带原子守卫(deletion_scheduled_at <= now),
 * 与「撤销注销即把该列置空」形成竞态安全:撤销后守卫 WHERE 命中 0 行,不会误删。
 */
export function createPurgeDeps(): PurgeDeps {
  return {
    nowMs: () => Date.now(),

    async listDue(now: Date, cfg: PurgeConfig): Promise<DueAccount[]> {
      const rows = await db
        .select({ userId: user.id })
        .from(user)
        .where(and(isNotNull(user.deletionScheduledAt), lte(user.deletionScheduledAt, now)))
        .limit(cfg.batchSize);
      return rows.map((r) => ({ userId: r.userId }));
    },

    // 与 API 侧的收集口径一致:范围对齐 FK 级联(owner 级联 或 其 workspace 级联删除的文档)。
    async collectStorageKeys(userId: string): Promise<string[]> {
      const rows = await db
        .select({ objectKey: documentFiles.objectKey })
        .from(documentFiles)
        .innerJoin(documents, eq(documentFiles.documentId, documents.id))
        .where(
          or(
            eq(documents.ownerId, userId),
            inArray(
              documents.workspaceId,
              db
                .select({ id: workspaces.id })
                .from(workspaces)
                .where(eq(workspaces.ownerId, userId)),
            ),
          ),
        );
      return rows.map((r) => r.objectKey);
    },

    deleteStorageObject: (key) => deleteObject(key),

    async purge(userId: string, now: Date): Promise<boolean> {
      // 原子守卫:仅当仍到期(未被撤销)才删。删 user 行 → FK 级联清空 workspace/文档/
      // chunks/对话/消息/通知/ai_generations 及 session/account/device_code/profile/follows。
      const deleted = await db
        .delete(user)
        .where(
          and(
            eq(user.id, userId),
            isNotNull(user.deletionScheduledAt),
            lte(user.deletionScheduledAt, now),
          ),
        )
        .returning({ id: user.id });
      return deleted.length > 0;
    },
  };
}
