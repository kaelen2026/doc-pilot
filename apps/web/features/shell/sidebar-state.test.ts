import { describe, expect, it } from "vitest";
import { sidebarBaseCollapsed } from "./sidebar-state";

describe("sidebarBaseCollapsed", () => {
  it("移动端无论桌面偏好如何都默认折叠", () => {
    expect(sidebarBaseCollapsed({ immersive: false, mobile: true, pref: false })).toBe(true);
  });

  it("沉浸式路由默认折叠", () => {
    expect(sidebarBaseCollapsed({ immersive: true, mobile: false, pref: false })).toBe(true);
  });

  it("桌面普通路由沿用用户偏好", () => {
    expect(sidebarBaseCollapsed({ immersive: false, mobile: false, pref: false })).toBe(false);
    expect(sidebarBaseCollapsed({ immersive: false, mobile: false, pref: true })).toBe(true);
  });
});
