import { describe, expect, it } from "vitest";
import { isImmersiveRoute } from "./route";

describe("isImmersiveRoute", () => {
  it("问答页沉浸,侧栏默认折叠", () => {
    expect(isImmersiveRoute("/documents/abc123/chat")).toBe(true);
  });

  it("阅读页沉浸,侧栏默认折叠", () => {
    expect(isImmersiveRoute("/documents/abc123/view")).toBe(true);
  });

  it("文档列表页不沉浸,侧栏默认展开", () => {
    expect(isImmersiveRoute("/documents")).toBe(false);
  });

  it("设置页不沉浸", () => {
    expect(isImmersiveRoute("/account")).toBe(false);
  });

  it("根路径不沉浸", () => {
    expect(isImmersiveRoute("/")).toBe(false);
  });

  it("文档详情下的未知子路由不沉浸", () => {
    expect(isImmersiveRoute("/documents/abc123/history")).toBe(false);
  });

  it("view/chat 作为文档 id 段本身不触发(需在 :id 之后)", () => {
    expect(isImmersiveRoute("/documents/chat")).toBe(false);
  });
});
