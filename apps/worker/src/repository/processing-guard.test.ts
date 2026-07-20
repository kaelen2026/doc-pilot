import { describe, expect, it } from "vitest";
import { passesProcessingGuard } from "./processing-guard";

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
});
