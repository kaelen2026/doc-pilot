import { QuotaExceededError } from "../../shared/errors";
import { monthStartUtc } from "./month";
import * as repo from "./quota.repository";
import { checkAskQuota, checkUploadQuota, type QuotaUsage, toUsage } from "./quota.rules";

/**
 * 配额检查必须在昂贵操作之前(cross-cutting.md §27.2)。本模块聚合各表用量,
 * 交给 quota.rules 的纯函数判定,越界抛 QuotaExceededError。
 */

/** 上传创建前:存储字节 + 文档数量。additionalBytes 为本次待上传大小。 */
export async function assertUploadQuota(params: {
  workspaceId: string;
  additionalBytes: number;
}): Promise<void> {
  const [storageBytes, documentCount] = await Promise.all([
    repo.sumStorageBytes(params.workspaceId),
    repo.countDocuments(params.workspaceId),
  ]);
  const violation = checkUploadQuota({ storageBytes, documentCount }, params.additionalBytes);
  if (violation) {
    throw new QuotaExceededError(violation.message);
  }
}

/** 问答前:月度提问次数 + 月度 AI Token(§27.2 的 Auth → Quota Check → Retrieval)。 */
export async function assertAskQuota(params: { workspaceId: string; now?: Date }): Promise<void> {
  const since = monthStartUtc(params.now ?? new Date());
  const [monthlyQuestions, monthlyAiTokens] = await Promise.all([
    repo.countMonthlyQuestions(params.workspaceId, since),
    repo.sumMonthlyAiTokens(params.workspaceId, since),
  ]);
  const violation = checkAskQuota({ monthlyAiTokens, monthlyQuestions });
  if (violation) {
    throw new QuotaExceededError(violation.message);
  }
}

/** 当前 workspace 各维度用量 vs 上限(供 GET /me/usage)。 */
export async function getUsage(workspaceId: string, now?: Date): Promise<QuotaUsage> {
  const since = monthStartUtc(now ?? new Date());
  const [storageBytes, documentCount, monthlyQuestions, monthlyAiTokens] = await Promise.all([
    repo.sumStorageBytes(workspaceId),
    repo.countDocuments(workspaceId),
    repo.countMonthlyQuestions(workspaceId, since),
    repo.sumMonthlyAiTokens(workspaceId, since),
  ]);
  return toUsage({ storageBytes, documentCount, monthlyAiTokens, monthlyQuestions });
}
