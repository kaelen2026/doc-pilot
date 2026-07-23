/**
 * 用量报表的纯装配逻辑(与框架/DB 解耦,可单测)。
 *
 * 分组求和交给 SQL(GROUP BY day / model,结果集有界),这里只做「已分组的小结果集 →
 * DTO」的装配:排序 + 汇总。抽成纯函数是为了把「汇总口径」钉在测试里(见 tdd.md)。
 */

/** 一组用量指标(按天或按模型聚合后的一行)。 */
export interface UsageMetrics {
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  count: number;
}

export interface UsageByDay extends UsageMetrics {
  /** 'YYYY-MM-DD'(服务器时区按天截断)。 */
  day: string;
}

export interface UsageByModel extends UsageMetrics {
  model: string;
}

export interface UsageReport {
  /** 按天升序,便于前端从左到右画趋势。 */
  byDay: UsageByDay[];
  /** 按成本降序,最贵的模型在前。 */
  byModel: UsageByModel[];
  /** 窗口内总计(由 byModel 汇总,与 byDay 汇总应一致)。 */
  totals: UsageMetrics;
}

function emptyMetrics(): UsageMetrics {
  return { costMicros: 0, inputTokens: 0, outputTokens: 0, count: 0 };
}

/** 把已分组的按天/按模型行装配成报表:排序 + 汇总。空输入返回零值报表。 */
export function buildUsageReport(input: {
  byDay: UsageByDay[];
  byModel: UsageByModel[];
}): UsageReport {
  const byDay = [...input.byDay].sort((a, b) => a.day.localeCompare(b.day));
  const byModel = [...input.byModel].sort((a, b) => b.costMicros - a.costMicros);
  const totals = byModel.reduce<UsageMetrics>((acc, row) => {
    acc.costMicros += row.costMicros;
    acc.inputTokens += row.inputTokens;
    acc.outputTokens += row.outputTokens;
    acc.count += row.count;
    return acc;
  }, emptyMetrics());
  return { byDay, byModel, totals };
}
