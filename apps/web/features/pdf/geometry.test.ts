import { describe, expect, it } from "vitest";
import { fitPageScale, type PageSlot, pageAtLine, rectsToNormalizedByPage } from "./geometry";

// 两页竖直排布,每页 800×1000,间距忽略。
const slots: PageSlot[] = [
  { page: 1, box: { left: 0, top: 0, right: 800, bottom: 1000, width: 800, height: 1000 } },
  { page: 2, box: { left: 0, top: 1000, right: 800, bottom: 2000, width: 800, height: 1000 } },
];

describe("rectsToNormalizedByPage", () => {
  it("按中心点命中页并归一化到 [0,1]", () => {
    const byPage = rectsToNormalizedByPage(
      [{ left: 80, top: 100, right: 480, bottom: 150, width: 400, height: 50 }],
      slots,
    );
    expect(byPage.get(1)).toEqual([{ x: 0.1, y: 0.1, w: 0.5, h: 0.05 }]);
    expect(byPage.has(2)).toBe(false);
  });

  it("跨页选择分派到各自页,且第二页坐标相对本页归一化(不含页偏移)", () => {
    const byPage = rectsToNormalizedByPage(
      [
        { left: 0, top: 100, right: 800, bottom: 140, width: 800, height: 40 },
        { left: 0, top: 1100, right: 400, bottom: 1140, width: 400, height: 40 },
      ],
      slots,
    );
    expect(byPage.get(1)).toEqual([{ x: 0, y: 0.1, w: 1, h: 0.04 }]);
    // 第二页的 y 相对本页顶部(1100-1000)/1000 = 0.1,而非 1.1。
    expect(byPage.get(2)).toEqual([{ x: 0, y: 0.1, w: 0.5, h: 0.04 }]);
  });

  it("不变量:归一化宽高恒 > 0,不塌成 0(#46 类回归护栏)", () => {
    const byPage = rectsToNormalizedByPage(
      [{ left: 10, top: 10, right: 30, bottom: 25, width: 20, height: 15 }],
      slots,
    );
    const rect = byPage.get(1)?.[0];
    expect(rect).toBeDefined();
    expect(rect?.w).toBeGreaterThan(0);
    expect(rect?.h).toBeGreaterThan(0);
  });

  it("过滤不足 1px 的碎 rect(选区边缘噪声)", () => {
    const byPage = rectsToNormalizedByPage(
      [{ left: 80, top: 100, right: 80.5, bottom: 100.4, width: 0.5, height: 0.4 }],
      slots,
    );
    expect(byPage.size).toBe(0);
  });

  it("中心点落在任何页外则丢弃(不误挂到相邻页)", () => {
    const byPage = rectsToNormalizedByPage(
      [{ left: 900, top: 100, right: 950, bottom: 140, width: 50, height: 40 }],
      slots,
    );
    expect(byPage.size).toBe(0);
  });
});

describe("pageAtLine", () => {
  const tops = [
    { page: 1, top: 0 },
    { page: 2, top: 500 },
    { page: 3, top: 1200 },
  ];

  it("取最后一个顶边 <= 阅读线的页", () => {
    expect(pageAtLine(-5, tops)).toBe(1); // 线在首页之上,回退第 1 页
    expect(pageAtLine(0, tops)).toBe(1);
    expect(pageAtLine(600, tops)).toBe(2);
    expect(pageAtLine(1200, tops)).toBe(3); // 边界:等于顶边算进入该页
    expect(pageAtLine(9999, tops)).toBe(3);
  });
});

describe("fitPageScale", () => {
  it("高约束更紧时取高约束", () => {
    // (1000-32)/(800*1.4142) ≈ 0.855
    expect(fitPageScale(1000, 800, Math.SQRT2, 0.5)).toBeCloseTo(0.8556, 3);
  });

  it("宽约束更紧时封顶到 1(适宽)", () => {
    expect(fitPageScale(5000, 800, Math.SQRT2, 0.5)).toBe(1);
  });

  it("不变量:结果不低于 minScale(极扁视口不会缩到不可见)", () => {
    expect(fitPageScale(40, 800, Math.SQRT2, 0.5)).toBe(0.5);
  });
});
