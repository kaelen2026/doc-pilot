import { isProfileUsername } from "@doc-pilot/contracts";
import { describe, expect, it } from "vitest";
import { generateProfileUsername } from "./workspace";

describe("公开用户名", () => {
  it("生成稳定格式且连续生成不重复", () => {
    const values = Array.from({ length: 20 }, generateProfileUsername);
    expect(values.every(isProfileUsername)).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });
});
