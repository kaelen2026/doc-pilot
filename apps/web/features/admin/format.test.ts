import { describe, expect, it } from "vitest";
import { formatCostMicros } from "./format";

describe("formatCostMicros", () => {
  it("0 显示 $0.00", () => {
    expect(formatCostMicros(0)).toBe("$0.00");
  });

  it("整额按两位小数", () => {
    expect(formatCostMicros(1_000_000)).toBe("$1.00");
    expect(formatCostMicros(12_340_000)).toBe("$12.34");
  });

  it("大额带千位分组", () => {
    expect(formatCostMicros(2_500_000_000)).toBe("$2,500.00");
  });

  it("不足一美分的小额展开到四位小数,避免显示成 $0.00", () => {
    expect(formatCostMicros(3_400)).toBe("$0.0034");
  });
});
