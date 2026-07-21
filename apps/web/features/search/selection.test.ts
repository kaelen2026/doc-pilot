import { describe, expect, it } from "vitest";
import { moveSelection } from "./selection";

describe("moveSelection", () => {
  it("空列表返回 -1", () => {
    expect(moveSelection(-1, 1, 0)).toBe(-1);
    expect(moveSelection(0, -1, 0)).toBe(-1);
  });

  it("未选中时向下选第一项、向上选最后一项", () => {
    expect(moveSelection(-1, 1, 3)).toBe(0);
    expect(moveSelection(-1, -1, 3)).toBe(2);
  });

  it("常规上下移动", () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, -1, 3)).toBe(1);
  });

  it("到达边界时循环", () => {
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
  });
});
