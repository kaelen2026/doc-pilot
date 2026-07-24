import { describe, expect, it } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_VERSION,
  PROCESSING_ERROR_CODES,
  PROCESSING_RETRY,
  RECONCILE,
} from "./processing";

describe("Embedding 契约", () => {
  it("向量维度 1024 与 EMBEDDING_VERSION v2(bge-m3)成对锁定——改任一个必须同时改另一个并重建向量", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1024);
    expect(EMBEDDING_VERSION).toBe("v2");
  });
});

describe("处理错误码", () => {
  it("错误码自映射(key === value),wire 格式改名即变红", () => {
    for (const [key, value] of Object.entries(PROCESSING_ERROR_CODES)) {
      expect(value).toBe(key);
    }
  });

  it("错误码互不重复", () => {
    const values = Object.values(PROCESSING_ERROR_CODES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("BullMQ 重试策略", () => {
  it("指数退避且至少重试一次(可重试错误不能一次就放弃)", () => {
    expect(PROCESSING_RETRY.attempts).toBeGreaterThanOrEqual(1);
    expect(PROCESSING_RETRY.backoff.type).toBe("exponential");
    expect(PROCESSING_RETRY.backoff.delay).toBeGreaterThan(0);
  });
});

describe("自动对账(RECONCILE)阈值", () => {
  it("queued 宽限 < processing 卡死阈值 ≤ 最大处理年龄(阈值必须严格分层,否则互相抢活)", () => {
    expect(RECONCILE.queuedGraceMs).toBeGreaterThan(0);
    expect(RECONCILE.queuedGraceMs).toBeLessThan(RECONCILE.processingStuckMs);
    expect(RECONCILE.processingStuckMs).toBeLessThanOrEqual(RECONCILE.maxProcessingAgeMs);
  });

  it("processing 卡死阈值大于对账周期(不与正常快路径 / BullMQ stalled 恢复抢活)", () => {
    expect(RECONCILE.processingStuckMs).toBeGreaterThan(RECONCILE.intervalMs);
  });

  it("pending_upload TTL 不超过最大处理年龄(放弃上传不能比毒丸文档活得久)", () => {
    expect(RECONCILE.pendingUploadTtlMs).toBeLessThanOrEqual(RECONCILE.maxProcessingAgeMs);
  });

  it("单轮批量上限为正整数", () => {
    expect(RECONCILE.batchSize).toBeGreaterThan(0);
    expect(Number.isInteger(RECONCILE.batchSize)).toBe(true);
  });
});
