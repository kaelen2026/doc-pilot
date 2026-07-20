import { describe, expect, it } from "vitest";
import { passesProcessingGuard, READY_STATUSES } from "./processing-guard";

function doc(
  overrides: Partial<{ deletedAt: Date | null; status: string; processingVersion: number }> = {},
) {
  return {
    deletedAt: null as Date | null,
    status: "processing",
    processingVersion: 1,
    ...overrides,
  };
}

describe("passesProcessingGuard", () => {
  it("版本匹配、未删除、状态正常 → 允许写入", () => {
    expect(passesProcessingGuard(doc(), 1)).toBe(true);
  });

  it("文档不存在(undefined) → 拒绝", () => {
    expect(passesProcessingGuard(undefined, 1)).toBe(false);
  });

  it("已软删除(deletedAt 非空) → 拒绝", () => {
    expect(passesProcessingGuard(doc({ deletedAt: new Date(0) }), 1)).toBe(false);
  });

  it("状态为 deleting / deleted → 拒绝", () => {
    expect(passesProcessingGuard(doc({ status: "deleting" }), 1)).toBe(false);
    expect(passesProcessingGuard(doc({ status: "deleted" }), 1)).toBe(false);
  });

  it("processing_version 不匹配(陈旧任务) → 拒绝", () => {
    expect(passesProcessingGuard(doc({ processingVersion: 2 }), 1)).toBe(false);
  });

  it("markFailed 策略(block READY_STATUSES):已就绪文档不得被覆盖成 failed", () => {
    const policy = { blockStatuses: READY_STATUSES };
    // 回归护栏:重复投递下,一次已成功后另一次末尾失败不得把 ready/partially_ready 覆盖成 failed。
    expect(passesProcessingGuard(doc({ status: "ready" }), 1, policy)).toBe(false);
    expect(passesProcessingGuard(doc({ status: "partially_ready" }), 1, policy)).toBe(false);
    // 仍在处理中的文档照常允许标失败。
    expect(passesProcessingGuard(doc({ status: "processing" }), 1, policy)).toBe(true);
  });

  it("默认策略不 block 就绪状态(markStage 语义):ready 仍视为可写", () => {
    expect(passesProcessingGuard(doc({ status: "ready" }), 1)).toBe(true);
  });
});
