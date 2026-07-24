import { describe, expect, it } from "vitest";
import { buildDerivedObjectKey, buildOriginalObjectKey } from "./keys";

// Key 规则见 data-model.md §9.1:按 workspace/document/version 分层,不使用用户文件名。
const input = { workspaceId: "ws_1", documentId: "doc_1", version: 3 };

describe("buildOriginalObjectKey", () => {
  it("按 workspace/document/version 分层,固定文件名 original.pdf 而非用户文件名", () => {
    expect(buildOriginalObjectKey(input)).toBe("workspaces/ws_1/documents/doc_1/v3/original.pdf");
  });

  it("版本号变化产生不同前缀,重处理不覆盖旧版本对象", () => {
    const v1 = buildOriginalObjectKey({ ...input, version: 1 });
    const v2 = buildOriginalObjectKey({ ...input, version: 2 });
    expect(v1).not.toBe(v2);
    expect(v2).toContain("/v2/");
  });
});

describe("buildDerivedObjectKey", () => {
  it("派生产物与原件共享同一版本前缀,仅文件名不同", () => {
    const derived = buildDerivedObjectKey({ ...input, name: "parsed.json" });
    const original = buildOriginalObjectKey(input);
    expect(derived).toBe("workspaces/ws_1/documents/doc_1/v3/parsed.json");
    expect(derived.slice(0, derived.lastIndexOf("/"))).toBe(
      original.slice(0, original.lastIndexOf("/")),
    );
  });
});
