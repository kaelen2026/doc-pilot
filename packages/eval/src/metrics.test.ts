import { describe, expect, it } from "vitest";
import { aggregate, recallAtK, reciprocalRank } from "./metrics";

const pages = (...ps: number[]) => ps.map((pageStart) => ({ pageStart }));

describe("recallAtK", () => {
  it("按期望页码覆盖率计算", () => {
    expect(recallAtK(pages(12, 3, 13, 7, 9), [12, 13], 5)).toBe(1);
    expect(recallAtK(pages(12, 3, 7, 9, 1), [12, 13], 5)).toBe(0.5);
    expect(recallAtK(pages(12, 3, 13), [12, 13], 2)).toBe(0.5);
  });

  it("重复页码不重复计数", () => {
    expect(recallAtK(pages(12, 12, 12), [12, 13], 3)).toBe(0.5);
  });
});

describe("reciprocalRank", () => {
  it("取第一个命中的排名倒数", () => {
    expect(reciprocalRank(pages(7, 12, 13), [12, 13])).toBe(1 / 2);
    expect(reciprocalRank(pages(12), [12])).toBe(1);
    expect(reciprocalRank(pages(1, 2), [9])).toBe(0);
  });
});

describe("aggregate", () => {
  it("Refusal Accuracy 双向计:该拒的拒 + 不该拒的没拒", () => {
    const report = aggregate(
      [],
      [
        base({ caseId: "a", shouldAnswer: true, refused: false }), // 对
        base({ caseId: "b", shouldAnswer: false, refused: true }), // 对
        base({ caseId: "c", shouldAnswer: false, refused: false }), // 错:该拒未拒
        base({ caseId: "d", shouldAnswer: true, refused: true }), // 错:误拒
      ],
    );
    expect(report.answer?.refusalAccuracy).toBe(0.5);
  });

  it("Citation Accuracy = 通过校验引用 / 声称引用;零声称为 null", () => {
    const withCitations = aggregate(
      [],
      [
        base({ caseId: "a", citationsClaimed: 3, citationsValid: 3 }),
        base({ caseId: "b", citationsClaimed: 1, citationsValid: 0 }),
      ],
    );
    expect(withCitations.answer?.citationAccuracy).toBe(0.75);
    const noCitations = aggregate([], [base({ caseId: "a" })]);
    expect(noCitations.answer?.citationAccuracy).toBeNull();
  });

  it("无 judge 分数时三项质量指标为 null", () => {
    const report = aggregate([], [base({ caseId: "a" })]);
    expect(report.answer?.correctness).toBeNull();
  });
});

function base(overrides: Partial<Parameters<typeof aggregate>[1][number]>) {
  return {
    caseId: "x",
    shouldAnswer: true,
    refused: false,
    citationsClaimed: 0,
    citationsValid: 0,
    correctness: null,
    faithfulness: null,
    relevance: null,
    ...overrides,
  };
}
