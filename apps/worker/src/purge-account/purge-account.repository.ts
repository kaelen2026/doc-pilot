import { db } from "@doc-pilot/database";
import {
  documentFiles,
  documents,
  pendingObjectDeletions,
  user,
  workspaces,
} from "@doc-pilot/database/schema";
import { deleteObject } from "@doc-pilot/storage";
import { and, asc, eq, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import type { DrainConfig, DrainDeps, PendingObject } from "./object-drain";
import type { DueAccount, PurgeConfig, PurgeDeps } from "./purger";

/**
 * 用真实 DB 构造账户清理的 PurgeDeps。硬删除与「登记待删对象」在**同一事务**里完成:
 * 收集 objectKey → 原子守卫删 user 行(deletion_scheduled_at <= now,与撤销竞态安全)→ 写
 * pending_object_deletions。删库(FK 级联清空其全部数据)与登记待删原子一致,崩溃不丢 key。
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

    async purgeAndEnqueue(userId: string, now: Date): Promise<boolean> {
      return db.transaction(async (tx) => {
        // 先收集会成孤儿的对象 key(范围对齐 FK 级联:owner 级联 或 其 workspace 级联删除的文档)。
        // 必须在删 user 前读——删后 document_files 已随级联消失。
        const files = await tx
          .select({
            provider: documentFiles.provider,
            bucket: documentFiles.bucket,
            objectKey: documentFiles.objectKey,
            sizeBytes: documentFiles.sizeBytes,
          })
          .from(documentFiles)
          .innerJoin(documents, eq(documentFiles.documentId, documents.id))
          .where(
            or(
              eq(documents.ownerId, userId),
              inArray(
                documents.workspaceId,
                tx
                  .select({ id: workspaces.id })
                  .from(workspaces)
                  .where(eq(workspaces.ownerId, userId)),
              ),
            ),
          );

        // 原子守卫:仅当仍到期(未被撤销)才删。命中 0 行 → 撤销竞态,回滚(不登记待删)。
        const deleted = await tx
          .delete(user)
          .where(
            and(
              eq(user.id, userId),
              isNotNull(user.deletionScheduledAt),
              lte(user.deletionScheduledAt, now),
            ),
          )
          .returning({ id: user.id });
        if (deleted.length === 0) {
          return false;
        }

        if (files.length > 0) {
          await tx.insert(pendingObjectDeletions).values(
            files.map((f) => ({
              provider: f.provider,
              bucket: f.bucket,
              objectKey: f.objectKey,
              sizeBytes: f.sizeBytes,
            })),
          );
        }
        return true;
      });
    },
  };
}

/**
 * 用真实 DB + 对象存储构造 drain 的 DrainDeps。消费 pending_object_deletions:删对象成功即销行,
 * 失败累加 attempts。attempts 达上限的行被 listPending 排除(死信)。
 */
export function createDrainDeps(): DrainDeps {
  return {
    async listPending(cfg: DrainConfig): Promise<PendingObject[]> {
      const rows = await db
        .select({ id: pendingObjectDeletions.id, objectKey: pendingObjectDeletions.objectKey })
        .from(pendingObjectDeletions)
        .where(lt(pendingObjectDeletions.attempts, cfg.maxAttempts))
        .orderBy(asc(pendingObjectDeletions.createdAt))
        .limit(cfg.batchSize);
      return rows;
    },

    deleteStorageObject: (key) => deleteObject(key),

    async markDone(id: string): Promise<void> {
      await db.delete(pendingObjectDeletions).where(eq(pendingObjectDeletions.id, id));
    },

    async markFailed(id: string, error: string): Promise<void> {
      // attempts + 1;截断 lastError 防超长。用 SQL 自增避免读改写竞态(drain 单实例,但稳妥)。
      await db
        .update(pendingObjectDeletions)
        .set({
          attempts: sql`${pendingObjectDeletions.attempts} + 1`,
          lastError: error.slice(0, 1000),
          lastAttemptAt: new Date(),
        })
        .where(eq(pendingObjectDeletions.id, id));
    },
  };
}
