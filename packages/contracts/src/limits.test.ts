import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  isAllowedMimeType,
  MAX_DOCUMENTS_PER_WORKSPACE,
  MAX_FILE_BYTES,
  MAX_PAGES,
  RATE_LIMITS,
  STORAGE_QUOTA_BYTES,
} from "./limits";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe("文件与配额限制", () => {
  it("单文件上限是精确的 50MB(二进制换算,三处执行必须逐字节一致)", () => {
    expect(MAX_FILE_BYTES).toBe(50 * 1024 * 1024);
  });

  it("存储配额是精确的 1GB,且至少容得下一个最大文件", () => {
    expect(STORAGE_QUOTA_BYTES).toBe(1024 * 1024 * 1024);
    expect(STORAGE_QUOTA_BYTES).toBeGreaterThanOrEqual(MAX_FILE_BYTES);
  });

  it("页数与文档数上限为正整数(0 会把上传/入库直接判死)", () => {
    expect(MAX_PAGES).toBeGreaterThan(0);
    expect(MAX_DOCUMENTS_PER_WORKSPACE).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_PAGES)).toBe(true);
    expect(Number.isInteger(MAX_DOCUMENTS_PER_WORKSPACE)).toBe(true);
  });
});

describe("isAllowedMimeType", () => {
  it("接受 PDF", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(true);
  });

  it("拒绝非 PDF、空串与大小写变体(MIME 匹配是精确匹配)", () => {
    expect(isAllowedMimeType("image/png")).toBe(false);
    expect(isAllowedMimeType("")).toBe(false);
    expect(isAllowedMimeType("APPLICATION/PDF")).toBe(false);
    expect(isAllowedMimeType("application/pdf ")).toBe(false);
  });

  it("白名单当前只有 PDF(扩格式属于产品决策,不许静默漂移)", () => {
    expect(ALLOWED_MIME_TYPES).toEqual(["application/pdf"]);
  });
});

describe("限流规则(令牌桶)", () => {
  it("每条规则的稳态速率等于突发上限(capacity === refillTokens,空桶一个周期灌满)", () => {
    for (const rule of Object.values(RATE_LIMITS)) {
      expect(rule.capacity).toBe(rule.refillTokens);
      expect(rule.capacity).toBeGreaterThan(0);
      expect(rule.intervalMs).toBeGreaterThan(0);
    }
  });

  it("登录验证码按小时计,其余规则按分钟计(单位换算不许错一个数量级)", () => {
    expect(RATE_LIMITS.loginOtp.intervalMs).toBe(HOUR_MS);
    expect(RATE_LIMITS.uploadCreate.intervalMs).toBe(MINUTE_MS);
    expect(RATE_LIMITS.ask.intervalMs).toBe(MINUTE_MS);
    expect(RATE_LIMITS.search.intervalMs).toBe(MINUTE_MS);
    expect(RATE_LIMITS.scanLoginCode.intervalMs).toBe(MINUTE_MS);
  });

  it("空桶时问答的单令牌补充耗时为 6 秒(10 次/分钟的稳态语义)", () => {
    const { intervalMs, refillTokens } = RATE_LIMITS.ask;
    expect(intervalMs / refillTokens).toBe(6_000);
  });
});
