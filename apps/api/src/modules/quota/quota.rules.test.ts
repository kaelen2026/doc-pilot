import {
  MAX_DOCUMENTS_PER_WORKSPACE,
  MONTHLY_AI_TOKENS_QUOTA,
  MONTHLY_QUESTIONS_QUOTA,
  STORAGE_QUOTA_BYTES,
} from "@doc-pilot/contracts";
import { describe, expect, it } from "vitest";
import { checkAskQuota, checkUploadQuota, toUsage } from "./quota.rules";

describe("checkUploadQuota", () => {
  it("存储 + 本次未超上限时放行", () => {
    expect(checkUploadQuota({ storageBytes: 0, documentCount: 0 }, 1024)).toBeNull();
  });

  it("已用 + 本次超出存储上限 → storage_bytes 违规", () => {
    const v = checkUploadQuota({ storageBytes: STORAGE_QUOTA_BYTES - 10, documentCount: 0 }, 100);
    expect(v?.resource).toBe("storage_bytes");
  });

  it("恰好等于上限不算超出(> 而非 >=)", () => {
    expect(
      checkUploadQuota({ storageBytes: STORAGE_QUOTA_BYTES - 100, documentCount: 0 }, 100),
    ).toBeNull();
  });

  it("文档数达上限 → document_count 违规", () => {
    const v = checkUploadQuota({ storageBytes: 0, documentCount: MAX_DOCUMENTS_PER_WORKSPACE }, 1);
    expect(v?.resource).toBe("document_count");
  });

  it("存储优先于文档数返回", () => {
    const v = checkUploadQuota(
      { storageBytes: STORAGE_QUOTA_BYTES, documentCount: MAX_DOCUMENTS_PER_WORKSPACE },
      1,
    );
    expect(v?.resource).toBe("storage_bytes");
  });
});

describe("checkAskQuota", () => {
  it("均未达上限时放行", () => {
    expect(checkAskQuota({ monthlyAiTokens: 0, monthlyQuestions: 0 })).toBeNull();
  });

  it("提问数达上限 → monthly_questions 违规", () => {
    const v = checkAskQuota({ monthlyAiTokens: 0, monthlyQuestions: MONTHLY_QUESTIONS_QUOTA });
    expect(v?.resource).toBe("monthly_questions");
  });

  it("Token 达上限 → monthly_ai_tokens 违规", () => {
    const v = checkAskQuota({ monthlyAiTokens: MONTHLY_AI_TOKENS_QUOTA, monthlyQuestions: 0 });
    expect(v?.resource).toBe("monthly_ai_tokens");
  });
});

describe("toUsage", () => {
  it("各维度带上对应上限", () => {
    const usage = toUsage({
      storageBytes: 5,
      documentCount: 2,
      monthlyAiTokens: 100,
      monthlyQuestions: 3,
    });
    expect(usage.storageBytes).toEqual({ used: 5, limit: STORAGE_QUOTA_BYTES });
    expect(usage.documentCount).toEqual({ used: 2, limit: MAX_DOCUMENTS_PER_WORKSPACE });
    expect(usage.monthlyAiTokens).toEqual({ used: 100, limit: MONTHLY_AI_TOKENS_QUOTA });
    expect(usage.monthlyQuestions).toEqual({ used: 3, limit: MONTHLY_QUESTIONS_QUOTA });
  });
});
