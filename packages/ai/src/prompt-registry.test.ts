import { describe, expect, it } from "vitest";
import { createPromptRegistry, type PromptDefinition } from "./prompt-registry";

const v1: PromptDefinition = {
  id: "document-summary",
  version: "1.0.0",
  build: () => ({ system: "v1", messages: [] }),
};

describe("prompt registry", () => {
  it("同 id 多版本共存，按 id + version 精确解析", () => {
    const registry = createPromptRegistry([
      v1,
      { ...v1, version: "1.1.0", build: () => ({ system: "v1.1", messages: [] }) },
    ]);
    expect(registry.resolve("document-summary", "1.0.0").build({}).system).toBe("v1");
    expect(registry.resolve("document-summary", "1.1.0").build({}).system).toBe("v1.1");
  });

  it("重复注册与解析未注册版本都直接抛错", () => {
    const registry = createPromptRegistry([v1]);
    expect(() => registry.register(v1)).toThrow(/重复注册/);
    expect(() => registry.resolve("document-summary", "9.9.9")).toThrow(/未注册/);
  });
});
