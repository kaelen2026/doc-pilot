import { describe, expect, it } from "vitest";
import { failureReason } from "./failure-reason";

describe("failureReason", () => {
  it("已知原因码翻成对应人话文案", () => {
    expect(failureReason("ENCRYPTED_PDF")).toBe("PDF 有密码保护,请上传未加密的版本");
    expect(failureReason("PAGE_LIMIT_EXCEEDED")).toBe("页数超过上限(500 页)");
    // #148 新增的 Worker 层大小复核码,文案必须跟上,不许静默漏映射。
    expect(failureReason("FILE_SIZE_LIMIT_EXCEEDED")).toBe("文件大小超过上限(50MB)");
  });

  it("瞬时/内部类错误一律提示可重试,不暴露技术细节", () => {
    for (const code of ["EMBEDDING_FAILED", "STORAGE_UNAVAILABLE", "DATABASE_ERROR", "INTERNAL"]) {
      expect(failureReason(code)).toBe("处理失败,请稍后重试");
    }
  });

  it("未知码与缺失码都回落到通用文案,绝不把原始码漏给用户", () => {
    expect(failureReason("SOME_FUTURE_CODE")).toBe("处理失败");
    expect(failureReason(null)).toBe("处理失败");
    expect(failureReason(undefined)).toBe("处理失败");
    expect(failureReason("")).toBe("处理失败");
  });
});
