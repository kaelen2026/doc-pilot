import {
  MAX_DOCUMENTS_PER_WORKSPACE,
  MONTHLY_AI_TOKENS_QUOTA,
  MONTHLY_QUESTIONS_QUOTA,
  STORAGE_QUOTA_BYTES,
} from "@doc-pilot/contracts";

/** 某一时刻 workspace 的配额用量快照。 */
export interface QuotaSnapshot {
  storageBytes: number;
  documentCount: number;
  monthlyAiTokens: number;
  monthlyQuestions: number;
}

/** 单个配额维度的用量与上限,供前端展示与 getUsage 返回。 */
export interface QuotaDimension {
  used: number;
  limit: number;
}

export interface QuotaUsage {
  storageBytes: QuotaDimension;
  documentCount: QuotaDimension;
  monthlyAiTokens: QuotaDimension;
  monthlyQuestions: QuotaDimension;
}

export interface QuotaViolation {
  /** 被突破的配额维度。 */
  resource: "storage_bytes" | "document_count" | "monthly_ai_tokens" | "monthly_questions";
  message: string;
}

/**
 * 上传创建前的配额校验(纯函数)。additionalBytes 为本次待上传文件大小。
 * 存储用「已用 + 本次 > 上限」判定;文档数用「已达上限」判定。
 */
export function checkUploadQuota(
  snapshot: Pick<QuotaSnapshot, "storageBytes" | "documentCount">,
  additionalBytes: number,
): QuotaViolation | null {
  if (snapshot.storageBytes + additionalBytes > STORAGE_QUOTA_BYTES) {
    return { resource: "storage_bytes", message: "存储空间配额已用尽" };
  }
  if (snapshot.documentCount >= MAX_DOCUMENTS_PER_WORKSPACE) {
    return { resource: "document_count", message: "文档数量已达上限" };
  }
  return null;
}

/** 问答前的月度配额校验(纯函数)。 */
export function checkAskQuota(
  snapshot: Pick<QuotaSnapshot, "monthlyAiTokens" | "monthlyQuestions">,
): QuotaViolation | null {
  if (snapshot.monthlyQuestions >= MONTHLY_QUESTIONS_QUOTA) {
    return { resource: "monthly_questions", message: "本月提问次数已达上限" };
  }
  if (snapshot.monthlyAiTokens >= MONTHLY_AI_TOKENS_QUOTA) {
    return { resource: "monthly_ai_tokens", message: "本月 AI Token 配额已用尽" };
  }
  return null;
}

/** 用量快照 → 各维度 used/limit,供 GET /me/usage 返回。 */
export function toUsage(snapshot: QuotaSnapshot): QuotaUsage {
  return {
    storageBytes: { used: snapshot.storageBytes, limit: STORAGE_QUOTA_BYTES },
    documentCount: { used: snapshot.documentCount, limit: MAX_DOCUMENTS_PER_WORKSPACE },
    monthlyAiTokens: { used: snapshot.monthlyAiTokens, limit: MONTHLY_AI_TOKENS_QUOTA },
    monthlyQuestions: { used: snapshot.monthlyQuestions, limit: MONTHLY_QUESTIONS_QUOTA },
  };
}
