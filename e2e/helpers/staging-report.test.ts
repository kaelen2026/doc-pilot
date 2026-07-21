import { describe, expect, it } from "vitest";
import { renderReport, resourcePeaks, type StagingReport } from "./staging-report";

describe("staging report", () => {
  it("按服务聚合资源峰值", () => {
    expect(
      resourcePeaks([
        { at: "a", service: "worker", cpuPercent: 10, memoryBytes: 100 },
        { at: "b", service: "worker", cpuPercent: 5, memoryBytes: 200 },
      ]),
    ).toEqual({ worker: { cpuPercent: 10, memoryBytes: 200 } });
  });

  it("报告包含结果、成本和分档", () => {
    const report: StagingReport = {
      schemaVersion: 1,
      runId: "run-1",
      startedAt: "start",
      completedAt: "end",
      outcome: "PASS",
      costBudgetMicros: 5_000_000,
      totalCostMicros: 100_000,
      warnings: [],
      tiers: [
        {
          pageCount: 10,
          fileBytes: 1024,
          documentId: "d1",
          status: "ready",
          readyMs: 1000,
          chunkCount: 2,
          textLength: 100,
          questions: [],
          aiCostMicros: 100_000,
          aiProviders: ["anthropic"],
          resourcePeaks: {},
          warnings: [],
        },
      ],
    };
    const markdown = renderReport(report);
    expect(markdown).toContain("**PASS**");
    expect(markdown).toContain("$0.1000");
    expect(markdown).toContain("| 10 |");
  });
});
