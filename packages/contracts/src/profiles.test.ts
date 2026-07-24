import { describe, expect, it } from "vitest";
import { isProfileUsername, isPublishableDocumentStatus, normalizeProfileUrl } from "./profiles";

describe("公开资料契约", () => {
  it("只接受服务端随机用户名格式", () => {
    expect(isProfileUsername("dp_k7m4q9x2")).toBe(true);
    expect(isProfileUsername("kaelen")).toBe(false);
  });

  it("资料链接只接受 https", () => {
    expect(normalizeProfileUrl("https://example.com/me")).toBe("https://example.com/me");
    expect(normalizeProfileUrl("http://example.com")).toBeNull();
    expect(normalizeProfileUrl("javascript:alert(1)")).toBeNull();
  });

  it("解析不了的字符串也归一化为 null(不抛异常,调用方只看 null)", () => {
    expect(normalizeProfileUrl("not a url")).toBeNull();
    expect(normalizeProfileUrl("")).toBeNull();
  });

  it("只有完成或部分完成文档可以公开", () => {
    expect(isPublishableDocumentStatus("ready")).toBe(true);
    expect(isPublishableDocumentStatus("partially_ready")).toBe(true);
    expect(isPublishableDocumentStatus("processing")).toBe(false);
    expect(isPublishableDocumentStatus("failed")).toBe(false);
  });
});
