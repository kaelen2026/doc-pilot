import { describe, expect, it } from "vitest";
import { buildUsageReport, type UsageByDay, type UsageByModel } from "./admin.rollup";

function day(overrides: Partial<UsageByDay> = {}): UsageByDay {
  return {
    day: "2026-07-01",
    costMicros: 0,
    inputTokens: 0,
    outputTokens: 0,
    count: 0,
    ...overrides,
  };
}
function model(overrides: Partial<UsageByModel> = {}): UsageByModel {
  return { model: "m", costMicros: 0, inputTokens: 0, outputTokens: 0, count: 0, ...overrides };
}

describe("buildUsageReport", () => {
  it("空输入返回零值报表", () => {
    expect(buildUsageReport({ byDay: [], byModel: [] })).toEqual({
      byDay: [],
      byModel: [],
      totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, count: 0 },
    });
  });

  it("byDay 按日期升序", () => {
    const report = buildUsageReport({
      byDay: [day({ day: "2026-07-03" }), day({ day: "2026-07-01" }), day({ day: "2026-07-02" })],
      byModel: [],
    });
    expect(report.byDay.map((r) => r.day)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });

  it("byModel 按成本降序,并把各模型汇总进 totals", () => {
    const report = buildUsageReport({
      byDay: [],
      byModel: [
        model({ model: "cheap", costMicros: 10, inputTokens: 1, outputTokens: 2, count: 1 }),
        model({ model: "pricey", costMicros: 90, inputTokens: 3, outputTokens: 4, count: 2 }),
      ],
    });
    expect(report.byModel.map((r) => r.model)).toEqual(["pricey", "cheap"]);
    expect(report.totals).toEqual({ costMicros: 100, inputTokens: 4, outputTokens: 6, count: 3 });
  });
});
