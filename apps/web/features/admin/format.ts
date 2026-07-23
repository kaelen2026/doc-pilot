// 管理后台展示用的纯格式化逻辑(与 DOM 解耦,单测钉住边界,见 format.test.ts)。
// 成本以微货币(1 美元 = 1,000,000 micros)存储,展示口径集中在这里。

/** 微货币 → 美元字符串。不足一美分的小额展开到四位小数,避免整屏 $0.00。 */
export function formatCostMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars > 0 && dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  }
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
