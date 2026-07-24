import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_COOLDOWN_DAYS,
  ACCOUNT_DELETION_COOLDOWN_MS,
  ACCOUNT_PURGE,
  OBJECT_PURGE,
} from "./account";

describe("账户注销冷静期", () => {
  it("毫秒值是天数的精确换算(API 算 deletion_scheduled_at、worker 判到期都靠它)", () => {
    expect(ACCOUNT_DELETION_COOLDOWN_MS).toBe(ACCOUNT_DELETION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    expect(ACCOUNT_DELETION_COOLDOWN_MS).toBe(604_800_000); // 7 天
  });
});

describe("账户清理(Purge)周期任务", () => {
  it("扫描周期远短于冷静期(到期账户不会滞留超过一个周期才被发现)", () => {
    expect(ACCOUNT_PURGE.intervalMs).toBeGreaterThan(0);
    expect(ACCOUNT_PURGE.intervalMs).toBeLessThan(ACCOUNT_DELETION_COOLDOWN_MS);
  });

  it("单轮批量上限为正整数(0 会让 purge 空转)", () => {
    expect(ACCOUNT_PURGE.batchSize).toBeGreaterThan(0);
    expect(Number.isInteger(ACCOUNT_PURGE.batchSize)).toBe(true);
  });
});

describe("对象存储清理(死信 drain)", () => {
  it("重试有限次后停手(maxAttempts 是死信语义,不是无限重试)", () => {
    expect(OBJECT_PURGE.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(OBJECT_PURGE.maxAttempts)).toBe(true);
  });

  it("单轮 drain 上限为正整数", () => {
    expect(OBJECT_PURGE.batchSize).toBeGreaterThan(0);
    expect(Number.isInteger(OBJECT_PURGE.batchSize)).toBe(true);
  });
});
